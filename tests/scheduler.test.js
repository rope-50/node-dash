import { describe, it, expect } from 'vitest';
import { buildPlan, segmentStartTimes, qualityLabel } from '../client/src/scheduler.js';

const VIDEOS = [
  { $: { id: '1', width: '512', height: '288' } },
  { $: { id: '3', width: '1280', height: '720' } },
];
const AUDIOS = [{ $: { id: '4' } }];

describe('buildPlan', () => {
  it('plays the lowest-quality video and the first audio track', () => {
    const plan = buildPlan(VIDEOS, AUDIOS);
    expect(plan.videoRep.$.id).toBe('1');
    expect(plan.audioRep.$.id).toBe('4');
  });

  it('schedules a cosmetic quality jump to a higher rep halfway', () => {
    const plan = buildPlan(VIDEOS, AUDIOS);
    expect(plan.segments).toBe(12);
    expect(plan.qualityJumpIndex).toBe(6);
    expect(plan.qualityJumpRep.$.id).toBe('3');
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
