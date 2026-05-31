import { loadRepresentations } from './manifest.js';
import { fetchRange } from './segment-loader.js';
import { parseSidx } from './sidx.js';
import { BufferQueue } from './source-buffer.js';
import { buildPlan, segmentStartTimes, qualityLabel } from './scheduler.js';
import { createControls } from './ui/controls.js';

/**
 * The DASH player. Loads representations, downloads the init segment, the `sidx`
 * index and a run of media subsegments by byte-range, and feeds them to a single
 * `MediaSource` carrying both a video and an audio `SourceBuffer` (one `<video>`
 * element). It also drives the controls, a cosmetic quality-label switch, and a
 * one-shot buffering simulation, recreating the YouTube-style experience.
 *
 * This replaces the prototype-based, jQuery-dependent `DashClient`.
 */
export class DashPlayer {
  /** @param {{ container: HTMLElement, manifestUrl: string }} options */
  constructor({ container, manifestUrl }) {
    this.container = container;
    this.manifestUrl = manifestUrl;
    this.plan = null;
    this.startTimes = [];
    this.duration = 0;
    this.qualityJumped = false;
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

    // The video track defines the timeline; load audio alongside it.
    const videoDurations = await this.#loadTrack(this.plan.videoRep, 'video');
    await this.#loadTrack(this.plan.audioRep, 'audio');

    await Promise.all([this.videoQueue.whenIdle(), this.audioQueue.whenIdle()]);
    try {
      this.mediaSource.endOfStream();
    } catch {
      /* both buffers may still settle; safe to ignore */
    }

    this.startTimes = segmentStartTimes(videoDurations);
    this.duration = videoDurations.reduce((sum, d) => sum + d, 0);
    this.controls.setDuration(this.duration);
    this.#setQuality(qualityLabel(this.plan.videoRep), qualityLabel(this.plan.audioRep));

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
    this.qualityJumped = false;
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

  // Downloads init + a run of subsegments for one representation. Returns the
  // per-subsegment durations (used to build the timeline).
  async #loadTrack(rep, kind) {
    const url = rep.BaseURL[0]._;
    const indexRange = rep.SegmentBase[0].$.indexRange;
    const initRange = rep.SegmentBase[0].Initialization[0].$.range;
    const indexEnd = parseInt(indexRange.split('-')[1], 10);
    const mimeCodec = `${rep.mimeType};codecs="${rep.$.codecs}"`;

    const queue = new BufferQueue(this.mediaSource, mimeCodec);
    if (kind === 'video') this.videoQueue = queue;
    else this.audioQueue = queue;

    queue.append(new Uint8Array(await fetchRange(url, initRange)));
    const { entries } = parseSidx(await fetchRange(url, indexRange));
    const count = Math.min(this.plan.segments, entries.length);
    for (let i = 0; i < count; i++) {
      const seg = entries[i];
      const startByte = indexEnd + 1 + seg.start;
      const endByte = startByte + seg.length - 1;
      queue.append(new Uint8Array(await fetchRange(url, `${startByte}-${endByte}`)));
    }
    return entries.slice(0, count).map((seg) => seg.duration);
  }

  #buildDom() {
    this.root = document.createElement('div');
    this.root.className = 'player';

    this.video = document.createElement('video');
    this.video.playsInline = true;

    this.info = document.createElement('div');
    this.info.className = 'info';
    this.info.innerHTML = '<span class="v"></span><span class="a"></span>';

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

    this.root.append(this.video, this.info, this.loadingBar, this.controls.element);
    this.container.append(this.root);
  }

  #setQuality(video, audio) {
    this.info.querySelector('.v').textContent = `Video: ${video}`;
    this.info.querySelector('.a').textContent = `Audio: ${audio}`;
  }

  #onTimeUpdate() {
    const time = this.video.currentTime;
    this.controls.setCurrentTime(time);

    const jumpTime = this.startTimes[this.plan.qualityJumpIndex];
    if (!this.qualityJumped && jumpTime != null && time >= jumpTime) {
      this.qualityJumped = true;
      this.#setQuality(
        qualityLabel(this.plan.qualityJumpRep),
        qualityLabel(this.plan.audioRep),
      );
    }

    const bufferTime = this.startTimes[this.plan.bufferingIndex];
    if (!this.bufferingFired && !this.buffering && bufferTime != null && time >= bufferTime) {
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
