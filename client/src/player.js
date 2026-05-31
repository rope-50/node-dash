import { loadRepresentations } from './manifest.js';
import { fetchRange, fetchWhole } from './segment-loader.js';
import { parseSidx } from './sidx.js';
import { BufferQueue } from './source-buffer.js';
import { buildPlan, segmentStartTimes, qualityLabel } from './scheduler.js';
import { createControls } from './ui/controls.js';

/**
 * The DASH player. Downloads a low-quality and a high-quality video track plus
 * an audio track and feeds them to a single `MediaSource` (one `<video>`
 * element with a video and an audio `SourceBuffer`). It supports both DASH
 * addressing models (SegmentBase byte-ranges and SegmentTemplate files),
 * performs a real low-to-high quality switch partway through, and simulates a
 * buffering pause, recreating the YouTube-style experience.
 *
 * This replaces the prototype-based, jQuery-dependent `DashClient`.
 */
export class DashPlayer {
  /** @param {{ container: HTMLElement, manifestUrl: string }} options */
  constructor({ container, manifestUrl }) {
    this.container = container;
    this.manifestUrl = manifestUrl;
    this.plan = null;
    this.duration = 0;
    this.switchTime = null;
    this.bufferingTime = null;
    this.shownHeight = null;
    this.bufferingFired = false;
    this.buffering = false;
  }

  /** Loads the stream, builds the UI, and prepares playback. */
  async init() {
    const { videos, audios } = await loadRepresentations(this.manifestUrl);
    this.plan = buildPlan(videos, audios);
    if (!this.plan) throw new Error('no playable video/audio representations');

    this.#buildDom();

    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);
    await new Promise((resolve) =>
      this.mediaSource.addEventListener('sourceopen', resolve, { once: true }),
    );

    // Add both source buffers up front, while the MediaSource is freshly open
    // and before any data flows. Adding the second one later (once the video
    // buffer is already active) makes Chrome reject it with a "reached the
    // limit of SourceBuffer objects" error.
    const lowCodec = this.#codec(this.plan.lowRep);
    const highCodec = this.#codec(this.plan.highRep);
    const audioCodec = this.#codec(this.plan.audioRep);
    for (const codec of [lowCodec, highCodec, audioCodec]) {
      if (!MediaSource.isTypeSupported(codec)) {
        throw new Error(`codec not supported by this browser: ${codec}`);
      }
    }
    // The video buffer starts on the low codec; #fillVideoTrack calls changeType
    // before the high segments if the high quality uses a different codec.
    this.videoQueue = new BufferQueue(this.mediaSource, lowCodec);
    this.audioQueue = new BufferQueue(this.mediaSource, audioCodec);

    // The video track defines the timeline (it switches quality partway);
    // fill the audio track alongside it.
    const videoDurations = await this.#fillVideoTrack(this.videoQueue);
    await this.#fillAudioTrack(this.audioQueue);

    await Promise.all([this.videoQueue.whenIdle(), this.audioQueue.whenIdle()]);
    try {
      this.mediaSource.endOfStream();
    } catch {
      /* both buffers may still settle; safe to ignore */
    }

    this.duration = videoDurations.reduce((sum, d) => sum + d, 0);
    // Trigger the buffering simulation only if it falls within the demo.
    this.bufferingTime =
      this.plan.bufferingAtSeconds < this.duration ? this.plan.bufferingAtSeconds : null;
    this.controls.setDuration(this.duration);
    // Show the audio track label once; the video badge reflects the REAL
    // resolution the <video> element reports (ground truth), not a prediction.
    this.info.querySelector('.a').textContent = `Audio: ${qualityLabel(this.plan.audioRep)}`;
    this.video.addEventListener('loadedmetadata', () => this.#updateResolution());
    this.video.addEventListener('resize', () => this.#updateResolution());

    this.video.addEventListener('timeupdate', () => this.#onTimeUpdate());
    return this;
  }

  play() {
    this.video.play();
    this.controls.setPlaying(true);
  }

  pause() {
    this.video.pause();
    this.controls.setPlaying(false);
  }

  stop() {
    this.video.pause();
    this.video.currentTime = 0;
    this.controls.setPlaying(false);
    this.bufferingFired = false;
  }

  seek(seconds) {
    this.video.currentTime = seconds;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) this.root.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // -- internals ------------------------------------------------------------

  // Builds the MSE codec string for a representation.
  #codec(rep) {
    return `${rep.mimeType};codecs="${rep.$.codecs}"`;
  }

  // Builds a uniform track accessor for either addressing model:
  //   init()      -> Promise<ArrayBuffer> of the initialization segment
  //   segment(i)  -> Promise<ArrayBuffer> of media subsegment i
  //   durations[] -> per-subsegment duration in seconds
  //   count       -> number of available subsegments
  async #trackInfo(rep) {
    if (rep.template) {
      // SegmentTemplate: init and each segment are their own files.
      const { init, segments } = rep.template;
      return {
        init: () => fetchWhole(init),
        segment: (i) => fetchWhole(segments[i].url),
        durations: segments.map((s) => s.duration),
        count: segments.length,
      };
    }

    // SegmentBase: parse the sidx to learn each subsegment's byte range/duration.
    const url = rep.BaseURL[0]._;
    const indexRange = rep.SegmentBase[0].$.indexRange;
    const initRange = rep.SegmentBase[0].Initialization[0].$.range;
    const indexEnd = parseInt(indexRange.split('-')[1], 10);
    const { entries } = parseSidx(await fetchRange(url, indexRange));
    const rangeOf = (i) => {
      const start = indexEnd + 1 + entries[i].start;
      return `${start}-${start + entries[i].length - 1}`;
    };
    return {
      init: () => fetchRange(url, initRange),
      segment: (i) => fetchRange(url, rangeOf(i)),
      durations: entries.map((e) => e.duration),
      count: entries.length,
    };
  }

  // Fills the video queue: low-quality subsegments first, then a real switch to
  // the high-quality representation (a codec change plus its init segment, which
  // reconfigures the decoder). Returns the per-subsegment durations.
  async #fillVideoTrack(queue) {
    const { lowRep, highRep, segments, switchAtSeconds } = this.plan;
    const switching = lowRep !== highRep;
    const low = await this.#trackInfo(lowRep);
    const high = switching ? await this.#trackInfo(highRep) : null;

    const count = Math.min(segments, low.count, high ? high.count : Infinity);
    const starts = segmentStartTimes(low.durations);
    let switchIndex = -1;
    if (switching) {
      // First subsegment (after the first) that starts at/after the target time.
      switchIndex = starts.findIndex((t, i) => i > 0 && t >= switchAtSeconds);
      if (switchIndex < 0 || switchIndex >= count) {
        switchIndex = Math.min(Math.floor(count / 2), count - 1);
      }
    }
    this.switchTime = switching ? starts[switchIndex] : null;

    queue.append(await low.init());
    const durations = [];
    let usingHigh = false;
    for (let i = 0; i < count; i++) {
      if (switching && i === switchIndex && !usingHigh) {
        console.log(
          `[dash] quality switch at segment ${i} (~${Math.round(starts[i])}s): ` +
            `${lowRep.$.width}x${lowRep.$.height} -> ${highRep.$.width}x${highRep.$.height}`,
        );
        queue.changeType(this.#codec(highRep)); // qualities may use different codecs
        queue.append(await high.init());
        usingHigh = true;
      }
      const track = usingHigh ? high : low;
      queue.append(await track.segment(i));
      durations.push(track.durations[i]);
    }
    return durations;
  }

  // Fills the audio queue from a single representation.
  async #fillAudioTrack(queue) {
    const info = await this.#trackInfo(this.plan.audioRep);
    queue.append(await info.init());
    const count = Math.min(this.plan.segments, info.count);
    for (let i = 0; i < count; i++) {
      queue.append(await info.segment(i));
    }
  }

  #buildDom() {
    this.root = document.createElement('div');
    this.root.className = 'player';

    this.video = document.createElement('video');
    this.video.playsInline = true;

    this.info = document.createElement('div');
    this.info.className = 'info';
    this.info.innerHTML = '<span class="v"></span><span class="a"></span>';

    // Prominent current-resolution badge (top-right), flashes on a quality change.
    this.badge = document.createElement('div');
    this.badge.className = 'quality-badge';

    this.loadingBar = document.createElement('div');
    this.loadingBar.className = 'loading-bar';
    this.loadingBar.innerHTML = '<span></span>';

    this.controls = createControls({
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onStop: () => this.stop(),
      onSeek: (time) => this.seek(time),
      onFullscreen: () => this.toggleFullscreen(),
    });

    this.root.append(this.video, this.info, this.badge, this.loadingBar, this.controls.element);
    this.container.append(this.root);
  }

  // Reflects the REAL resolution the <video> element is decoding right now.
  // Fires on loadedmetadata and whenever the decoder reconfigures (the 'resize'
  // event), so the badge shows the genuine low-to-high change rather than a
  // predicted label.
  #updateResolution() {
    const height = this.video.videoHeight;
    if (!height || height === this.shownHeight) return;
    this.shownHeight = height;

    this.info.querySelector('.v').textContent = `Video: ${this.video.videoWidth}x${height}`;
    this.badge.textContent = `${height}p`;
    this.badge.classList.remove('flash');
    void this.badge.offsetWidth; // force reflow so the animation restarts
    this.badge.classList.add('flash');
    console.log(`[dash] now decoding ${this.video.videoWidth}x${height}`);
  }

  #onTimeUpdate() {
    const time = this.video.currentTime;
    this.controls.setCurrentTime(time);

    if (!this.bufferingFired && !this.buffering && this.bufferingTime != null && time >= this.bufferingTime) {
      this.bufferingFired = true;
      this.#simulateBuffering(this.plan.bufferingSeconds * 1000);
    }
  }

  // Pauses playback briefly with an animated loading bar, like a real stall.
  #simulateBuffering(ms) {
    if (this.video.paused) return;
    this.buffering = true;
    this.video.pause();
    this.loadingBar.classList.add('active');
    const fill = this.loadingBar.firstElementChild;
    const start = performance.now();

    const tick = () => {
      const pct = Math.min(100, ((performance.now() - start) / ms) * 100);
      fill.style.width = `${pct}%`;
      if (pct < 100 && this.buffering) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    setTimeout(() => {
      this.loadingBar.classList.remove('active');
      fill.style.width = '0%';
      this.buffering = false;
      this.video.play();
    }, ms);
  }
}
