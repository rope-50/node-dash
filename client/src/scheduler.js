/**
 * Builds the playback plan from a representation list and maps subsegments onto
 * a timeline. This is the pure, framework-free replacement for the old
 * server-side `buildVideoData` plus the client's `getSequence` bookkeeping.
 *
 * To make adaptive streaming visible, the plan starts on the lowest-quality
 * video and switches to the highest-quality one partway through (a real
 * representation switch, not just a label), and simulates one buffering pause.
 */

// Cap the high quality at 1080p so downloads and decoding stay light (some
// streams go up to 4K, which is heavy for a short demo).
const MAX_HEIGHT = 1080;

/**
 * @param {object[]} videos - Video representations (any order).
 * @param {object[]} audios - Audio representations.
 * @param {{ segments?: number, switchAtSeconds?: number, bufferingAtSeconds?: number, bufferingSeconds?: number }} [opts]
 * @returns {null | {
 *   lowRep: object, highRep: object, audioRep: object, segments: number,
 *   switchAtSeconds: number, bufferingAtSeconds: number, bufferingSeconds: number
 * }}
 */
export function buildPlan(videos, audios, opts = {}) {
  const {
    segments = 6,
    switchAtSeconds = 6,
    bufferingAtSeconds = 14,
    bufferingSeconds = 1.5,
  } = opts;
  if (videos.length === 0 || audios.length === 0) return null;

  const byHeight = [...videos].sort((a, b) => Number(a.$.height) - Number(b.$.height));
  const lowRep = byHeight[0];
  const capped = byHeight.filter((v) => Number(v.$.height) <= MAX_HEIGHT);
  const highRep = (capped.length ? capped : byHeight).at(-1);

  return {
    lowRep,
    highRep,
    audioRep: audios[0],
    segments,
    switchAtSeconds,
    bufferingAtSeconds,
    bufferingSeconds,
  };
}

/**
 * Cumulative start time (in seconds) of each subsegment, from its durations.
 * `segmentStartTimes([2, 2, 2])` -> `[0, 2, 4]`.
 *
 * @param {number[]} durations
 * @returns {number[]}
 */
export function segmentStartTimes(durations) {
  const times = [];
  let elapsed = 0;
  for (const duration of durations) {
    times.push(elapsed);
    elapsed += duration;
  }
  return times;
}

/**
 * Human-readable height label for a representation, e.g. `"288p"`.
 * @param {object} rep
 * @returns {string}
 */
export function qualityLabel(rep) {
  return rep?.$?.height ? `${rep.$.height}p` : 'audio';
}
