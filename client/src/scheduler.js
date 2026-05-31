/**
 * Builds the playback plan from a representation list and maps subsegments onto
 * a timeline. This is the pure, framework-free replacement for the old
 * server-side `buildVideoData` plus the client's `getSequence` bookkeeping.
 *
 * Behavior parity with the original: play the lowest-quality video and a single
 * audio track, show a cosmetic "quality jump" label halfway through, and
 * simulate one buffering pause, recreating the YouTube-style experience.
 */

/**
 * @param {object[]} videos - Video representations (lowest quality first).
 * @param {object[]} audios - Audio representations.
 * @param {{ segments?: number, bufferingIndex?: number, bufferingSeconds?: number }} [opts]
 * @returns {null | {
 *   videoRep: object, audioRep: object, segments: number,
 *   qualityJumpIndex: number, qualityJumpRep: object,
 *   bufferingIndex: number, bufferingSeconds: number
 * }}
 */
export function buildPlan(videos, audios, opts = {}) {
  const { segments = 12, bufferingIndex = 4, bufferingSeconds = 1.5 } = opts;
  if (videos.length === 0 || audios.length === 0) return null;

  return {
    videoRep: videos[0],
    audioRep: audios[0],
    segments,
    qualityJumpIndex: Math.floor(segments / 2),
    qualityJumpRep: videos[1] ?? videos[0], // cosmetic label switch
    bufferingIndex,
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
