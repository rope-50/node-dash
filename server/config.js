/**
 * Runtime configuration.
 *
 * The player supports both DASH addressing models: on-demand `SegmentBase`
 * (single file per representation, byte-range requests) and `SegmentTemplate`
 * (numbered segment files). The default below uses SegmentTemplate.
 */

// Default manifest used when the client requests /dash/manifest with no src.
// Big Buck Bunny: bright content with qualities from 180p up to 1080p+, so the
// low-to-high quality switch is dramatic. Uses the SegmentTemplate model.
export const DEFAULT_MANIFEST =
  'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd';

// Hosts the server is allowed to fetch from. This keeps the media proxy from
// becoming an open relay (SSRF): only these origins can be requested.
export const ALLOWED_HOSTS = new Set([
  'dash.akamaized.net',
]);
