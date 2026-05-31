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
 * Flattens a parsed MPD into the representation list the client consumes,
 * supporting both DASH addressing models:
 *   - SegmentBase: one file per representation; the entry carries the proxied
 *     BaseURL plus the index and initialization byte-ranges (the client parses
 *     the `sidx` and fetches subsegments by byte range).
 *   - SegmentTemplate: numbered segment files; the entry carries a `template`
 *     with a proxied init URL and a list of proxied segment URLs + durations.
 *
 * @param {object} mpd - Parsed MPD (output of {@link fetchManifest}).
 * @param {string} srcUrl - The manifest URL, used to resolve relative URLs.
 * @returns {Array<object>} Video and audio representations.
 */
const TEMPLATE_SEGMENTS = 8; // segment URLs exposed per SegmentTemplate rep

function proxied(absoluteUrl) {
  return `/dash/proxy?url=${encodeURIComponent(absoluteUrl)}`;
}

export function normalizeManifest(mpd, srcUrl) {
  const adaptationSets = mpd?.MPD?.Period?.[0]?.AdaptationSet ?? [];
  const mpdBaseNode = mpd?.MPD?.BaseURL?.[0];
  const mpdBaseText = typeof mpdBaseNode === 'string' ? mpdBaseNode : mpdBaseNode?._ ?? './';
  const baseUrl = new URL(mpdBaseText, srcUrl).href;

  const representations = [];
  for (const set of adaptationSets) {
    const setAttrs = set.$ ?? {};
    const setTemplate = set.SegmentTemplate?.[0];

    for (const rep of set.Representation ?? []) {
      const attrs = rep.$ ?? {};
      const common = {
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
      };

      // SegmentTemplate (template may live on the Representation or AdaptationSet).
      const template = rep.SegmentTemplate?.[0] ?? setTemplate;
      if (template) {
        representations.push({ ...common, template: buildTemplate(template.$, attrs.id, baseUrl) });
        continue;
      }

      // SegmentBase.
      const segmentBase = rep.SegmentBase?.[0];
      const indexRange = segmentBase?.$?.indexRange;
      if (!indexRange) continue; // unsupported addressing

      // Initialization range: explicit, or the on-demand implicit range from
      // the start of the file up to the index segment.
      const explicitInit = segmentBase.Initialization?.[0]?.$?.range;
      const indexStart = parseInt(indexRange.split('-')[0], 10);
      const initRange = explicitInit ?? `0-${indexStart - 1}`;

      // <BaseURL> may be a bare string or an object with attributes.
      const baseUrlNode = rep.BaseURL?.[0];
      const baseUrlText = typeof baseUrlNode === 'string' ? baseUrlNode : baseUrlNode?._ ?? '';
      const absoluteUrl = new URL(baseUrlText, baseUrl).href;

      representations.push({
        ...common,
        BaseURL: [{ _: proxied(absoluteUrl) }],
        SegmentBase: [{ $: { indexRange }, Initialization: [{ $: { range: initRange } }] }],
      });
    }
  }

  return representations;
}

// Expands a SegmentTemplate into a proxied init URL and a list of proxied
// segment URLs with their durations (in seconds).
function buildTemplate(t, repId, baseUrl) {
  const timescale = parseInt(t.timescale ?? '1', 10);
  const duration = parseInt(t.duration, 10) / timescale;
  const startNumber = parseInt(t.startNumber ?? '1', 10);

  const fill = (pattern, number) =>
    pattern.replace(/\$RepresentationID\$/g, repId).replace(/\$Number\$/g, String(number));

  const segments = [];
  for (let i = 0; i < TEMPLATE_SEGMENTS; i++) {
    segments.push({
      url: proxied(new URL(fill(t.media, startNumber + i), baseUrl).href),
      duration,
    });
  }
  return {
    init: proxied(new URL(fill(t.initialization, 0), baseUrl).href),
    segments,
  };
}
