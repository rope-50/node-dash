/**
 * DASH manifest handling.
 *
 * Fetches an MPEG-DASH manifest (MPD) and flattens its representations into the
 * compact JSON shape the browser client expects, while:
 *   - routing every media URL through our same-origin proxy (avoids CORS),
 *   - resolving relative `BaseURL`s against the manifest URL,
 *   - synthesizing the initialization byte-range when the MPD omits it (in the
 *     on-demand profile the init segment is implicitly bytes `0 .. indexStart-1`).
 */

import { Parser } from 'xml2js';
import { ALLOWED_HOSTS } from './config.js';

const parser = new Parser();

/**
 * Whether `rawUrl` is an http(s) URL on the allowlist. Guards the proxy against
 * being used as an open relay.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isAllowedUrl(rawUrl) {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    return (protocol === 'https:' || protocol === 'http:') && ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Fetches and parses an MPD into a plain object (via xml2js).
 * @param {string} srcUrl
 * @returns {Promise<object>}
 */
export async function fetchManifest(srcUrl) {
  const res = await fetch(srcUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`manifest fetch failed: HTTP ${res.status}`);
  return parser.parseStringPromise(await res.text());
}

/**
 * Flattens a parsed MPD into the representation list the client consumes.
 *
 * Each entry mirrors the structure the client reads: `$` attributes, a `mimeType`,
 * a single `BaseURL` (proxied), and a `SegmentBase` carrying the index and
 * initialization byte-ranges. Representations without `SegmentBase`/`indexRange`
 * are skipped because the client only supports that addressing model.
 *
 * @param {object} mpd - Parsed MPD (output of {@link fetchManifest}).
 * @param {string} srcUrl - The manifest URL, used to resolve relative BaseURLs.
 * @returns {Array<object>} Video and audio representations.
 */
export function normalizeManifest(mpd, srcUrl) {
  const adaptationSets = mpd?.MPD?.Period?.[0]?.AdaptationSet ?? [];
  const representations = [];

  for (const set of adaptationSets) {
    const setAttrs = set.$ ?? {};
    for (const rep of set.Representation ?? []) {
      const attrs = rep.$ ?? {};
      const segmentBase = rep.SegmentBase?.[0];
      const indexRange = segmentBase?.$?.indexRange;
      if (!indexRange) continue; // unsupported addressing (e.g. SegmentTemplate)

      // Initialization range: use the explicit one, otherwise the on-demand
      // implicit range from the start of the file up to the index segment.
      const explicitInit = segmentBase.Initialization?.[0]?.$?.range;
      const indexStart = parseInt(indexRange.split('-')[0], 10);
      const initRange = explicitInit ?? `0-${indexStart - 1}`;

      // <BaseURL> may be a bare string or an object with attributes.
      const baseUrlNode = rep.BaseURL?.[0];
      const baseUrlText = typeof baseUrlNode === 'string' ? baseUrlNode : baseUrlNode?._ ?? '';
      const absoluteUrl = new URL(baseUrlText, srcUrl).href;
      const proxiedUrl = `/dash/proxy?url=${encodeURIComponent(absoluteUrl)}`;

      representations.push({
        $: {
          id: attrs.id,
          width: attrs.width,
          height: attrs.height,
          bandwidth: attrs.bandwidth,
          codecs: attrs.codecs ?? setAttrs.codecs,
        },
        // The client reads mimeType as a top-level property; fall back to the
        // value on the AdaptationSet when the Representation omits it.
        mimeType: attrs.mimeType ?? setAttrs.mimeType,
        BaseURL: [{ _: proxiedUrl }],
        SegmentBase: [
          { $: { indexRange }, Initialization: [{ $: { range: initRange } }] },
        ],
      });
    }
  }

  return representations;
}
