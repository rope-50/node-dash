import { describe, it, expect } from 'vitest';
import { normalizeManifest, buildVideoData, isAllowedUrl } from '../src/dash.js';

const SRC = 'https://dash.akamaized.net/dash264/TestCases/2a/qualcomm/1/MultiResMPEG2.mpd';

// A parsed MPD (xml2js shape) mirroring the Qualcomm on-demand test vector:
// SegmentBase + indexRange, BaseURL as a bare string, no explicit Initialization,
// and the audio's mimeType living on the AdaptationSet.
const PARSED_MPD = {
  MPD: {
    Period: [
      {
        AdaptationSet: [
          {
            $: { mimeType: 'video/mp4' },
            Representation: [
              {
                $: { id: '1', width: '512', height: '288', bandwidth: '1197707', codecs: 'avc1.4d401f', mimeType: 'video/mp4' },
                BaseURL: ['ED_512_640K_MPEG2_video_init.mp4'],
                SegmentBase: [{ $: { indexRange: '883-4838' } }],
              },
              {
                $: { id: '3', width: '1280', height: '720', bandwidth: '4102610', codecs: 'avc1.4d401f', mimeType: 'video/mp4' },
                BaseURL: ['ED_1280_4M_MPEG2_video_init.mp4'],
                SegmentBase: [{ $: { indexRange: '885-4840' } }],
              },
            ],
          },
          {
            $: { mimeType: 'audio/mp4' },
            Representation: [
              {
                $: { id: '4', bandwidth: '33204', codecs: 'mp4a.40.29' },
                BaseURL: ['ED_MPEG2_32k_init.mp4'],
                SegmentBase: [{ $: { indexRange: '820-4859' } }],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('isAllowedUrl', () => {
  it('allows hosts on the allowlist over http(s)', () => {
    expect(isAllowedUrl('https://dash.akamaized.net/a.mpd')).toBe(true);
  });

  it('blocks unknown hosts and non-http protocols', () => {
    expect(isAllowedUrl('https://evil.example.com/a.mpd')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedUrl('not a url')).toBe(false);
  });
});

describe('normalizeManifest', () => {
  const reps = normalizeManifest(PARSED_MPD, SRC);

  it('returns all SegmentBase representations', () => {
    expect(reps.map((r) => r.$.id)).toEqual(['1', '3', '4']);
  });

  it('synthesizes the missing initialization range as 0..indexStart-1', () => {
    expect(reps[0].SegmentBase[0].Initialization[0].$.range).toBe('0-882');
    expect(reps[2].SegmentBase[0].Initialization[0].$.range).toBe('0-819');
  });

  it('routes BaseURLs through the proxy with an absolute upstream URL', () => {
    const proxied = reps[0].BaseURL[0]._;
    expect(proxied).toContain('/dash/proxy?url=');
    const upstream = decodeURIComponent(proxied.split('url=')[1]);
    expect(upstream).toBe(
      'https://dash.akamaized.net/dash264/TestCases/2a/qualcomm/1/ED_512_640K_MPEG2_video_init.mp4',
    );
  });

  it('keeps the index range and carries mimeType/codecs', () => {
    expect(reps[0].SegmentBase[0].$.indexRange).toBe('883-4838');
    expect(reps[0].mimeType).toBe('video/mp4');
    expect(reps[2].mimeType).toBe('audio/mp4'); // inherited from the AdaptationSet
    expect(reps[2].$.codecs).toBe('mp4a.40.29');
  });

  it('skips representations without a SegmentBase index range', () => {
    const noIndex = {
      MPD: { Period: [{ AdaptationSet: [{ Representation: [{ $: { id: 'x' }, SegmentBase: [{ $: {} }] }] }] }] },
    };
    expect(normalizeManifest(noIndex, SRC)).toEqual([]);
  });
});

describe('buildVideoData', () => {
  const reps = normalizeManifest(PARSED_MPD, SRC);
  const videoData = buildVideoData(SRC, reps);

  it('points the client at the manifest endpoint', () => {
    expect(videoData.manifest).toBe(`/dash/manifest?src=${encodeURIComponent(SRC)}`);
  });

  it('builds a 12-segment sequence that jumps to a higher quality halfway', () => {
    expect(videoData.sequence.split(';')).toEqual(
      ['1', '1', '1', '1', '1', '1', '3', '3', '3', '3', '3', '3'],
    );
    expect(videoData.audio_sequence.split(';')).toEqual(Array(12).fill('4'));
  });

  it('returns null when there is no video or no audio', () => {
    const onlyVideo = reps.filter((r) => r.$.width);
    expect(buildVideoData(SRC, onlyVideo)).toBeNull();
  });
});
