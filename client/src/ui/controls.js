import { icons } from './icons.js';

/**
 * Formats seconds as `mm:ss`.
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Builds the controls bar (play/pause/stop, seek, time, fullscreen) with native
 * DOM and inline SVG icons, and wires the callbacks. Returns the element plus a
 * small API the player uses to keep the UI in sync.
 *
 * @param {{
 *   onPlay: () => void, onPause: () => void, onStop: () => void,
 *   onSeek: (time: number) => void, onFullscreen: () => void
 * }} handlers
 */
export function createControls(handlers) {
  const bar = document.createElement('div');
  bar.className = 'controls';
  bar.innerHTML = `
    <button class="btn play" type="button" aria-label="Play">${icons.play}</button>
    <button class="btn pause" type="button" aria-label="Pause" hidden>${icons.pause}</button>
    <button class="btn stop" type="button" aria-label="Stop">${icons.stop}</button>
    <input class="seek" type="range" min="0" max="0" step="0.01" value="0" aria-label="Seek" />
    <span class="time">00:00</span>
    <button class="btn fullscreen" type="button" aria-label="Fullscreen">${icons.fullscreen}</button>
  `;

  const playBtn = bar.querySelector('.play');
  const pauseBtn = bar.querySelector('.pause');
  const stopBtn = bar.querySelector('.stop');
  const seek = bar.querySelector('.seek');
  const time = bar.querySelector('.time');

  playBtn.addEventListener('click', handlers.onPlay);
  pauseBtn.addEventListener('click', handlers.onPause);
  stopBtn.addEventListener('click', handlers.onStop);
  bar.querySelector('.fullscreen').addEventListener('click', handlers.onFullscreen);
  seek.addEventListener('input', () => handlers.onSeek(Number(seek.value)));

  return {
    element: bar,
    /** Toggles between the play and pause buttons. */
    setPlaying(playing) {
      playBtn.hidden = playing;
      pauseBtn.hidden = !playing;
    },
    /** Sets the seek bar's maximum (total duration). */
    setDuration(seconds) {
      seek.max = String(seconds);
    },
    /** Reflects the current playback position. */
    setCurrentTime(seconds) {
      if (document.activeElement !== seek) seek.value = String(seconds);
      time.textContent = formatTime(seconds);
    },
  };
}
