import { describe, it, expect } from 'vitest';
import { buildPlan, segmentStartTimes, qualityLabel } from '../client/src/scheduler.js';

// Deliberately unordered, and includes a 4K rep to test the 1080p cap.
const VIDEOS = [
  { $: { id: 'v720', width: '1280', height: '720' } },
  { $: { id: 'v180', width: '320', height: '180' } },
  { $: { id: 'v2160', width: '3840', height: '2160' } },
  { $: { id: 'v1080', width: '1920', height: '1080' } },
];
const AUDIOS = [{ $: { id: 'a1' } }];

describe('buildPlan', () => {
  it('picks the lowest quality and caps the high quality at 1080p', () => {
    const plan = buildPlan(VIDEOS, AUDIOS);
    expect(plan.lowRep.$.id).toBe('v180'); // lowest, regardless of input order
    expect(plan.highRep.$.id).toBe('v1080'); // highest <= 1080p (not the 4K rep)
    expect(plan.audioRep.$.id).toBe('a1');
  });

  it('exposes timeline targets in seconds', () => {
    const plan = buildPlan(VIDEOS, AUDIOS);
    expect(plan.segments).toBe(6);
    expect(plan.switchAtSeconds).toBe(6);
    expect(plan.bufferingAtSeconds).toBe(14);
  });

  it('uses the only quality for both low and high when there is just one', () => {
    const plan = buildPlan([VIDEOS[1]], AUDIOS);
    expect(plan.lowRep.$.id).toBe('v180');
    expect(plan.highRep.$.id).toBe('v180');
  });

  it('returns null when there is no video or no audio', () => {
    expect(buildPlan([], AUDIOS)).toBeNull();
    expect(buildPlan(VIDEOS, [])).toBeNull();
  });
});

describe('segmentStartTimes', () => {
  it('accumulates durations into start times', () => {
    expect(segmentStartTimes([2, 2, 3])).toEqual([0, 2, 4]);
    expect(segmentStartTimes([])).toEqual([]);
  });
});

describe('qualityLabel', () => {
  it('labels by height, or "audio" when there is none', () => {
    expect(qualityLabel({ $: { height: '288' } })).toBe('288p');
    expect(qualityLabel({ $: {} })).toBe('audio');
  });
});
