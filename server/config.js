/**
 * Runtime configuration.
 *
 * The player works with any MPEG-DASH stream that uses the on-demand
 * `SegmentBase` + `sidx` addressing model (a single file per representation with
 * byte-range requests). The default below is a public DASH-IF test vector.
 */

// Default manifest used when the client requests /dash/manifest with no src.
export const DEFAULT_MANIFEST =
  'https://dash.akamaized.net/dash264/TestCases/2a/qualcomm/1/MultiResMPEG2.mpd';

// Hosts the server is allowed to fetch from. This keeps the media proxy from
// becoming an open relay (SSRF): only these origins can be requested.
export const ALLOWED_HOSTS = new Set([
  'dash.akamaized.net',
]);
