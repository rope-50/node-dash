/**
 * Loads the normalized representation list from the server and splits it into
 * video and audio tracks. The server has already routed every `BaseURL` through
 * its proxy and synthesized the initialization byte-range, so the client just
 * consumes the JSON.
 *
 * Audio representations have no `width`, which is how they are distinguished.
 *
 * @param {string} manifestUrl - The server manifest endpoint, e.g. `/dash/manifest`.
 * @returns {Promise<{ videos: object[], audios: object[] }>}
 */
export async function loadRepresentations(manifestUrl) {
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    throw new Error(`manifest request failed (${res.status})`);
  }
  const reps = await res.json();
  return {
    videos: reps.filter((rep) => rep.$.width),
    audios: reps.filter((rep) => !rep.$.width),
  };
}
