/**
 * Fetches a byte range of `url` as an ArrayBuffer using an HTTP `Range` request.
 *
 * The server proxies these to the upstream DASH stream, which replies with
 * `206 Partial Content`. Replaces the old jQuery/XHR range loading.
 *
 * @param {string} url - Media URL (already pointing at the server proxy).
 * @param {string} range - Byte range, e.g. `"0-882"`.
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchRange(url, range) {
  const res = await fetch(url, { headers: { Range: `bytes=${range}` } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`range request failed (${res.status}) for ${range}`);
  }
  return res.arrayBuffer();
}
