import { describe, it, expect } from 'vitest';
import { parseSidx } from '../client/src/sidx.js';

// Builds a minimal version-0 `sidx` box with two references.
function buildSidx({ markReferenceType = false } = {}) {
  const buf = new ArrayBuffer(56);
  const v = new DataView(buf);
  v.setUint32(0, 56); // box size
  v.setUint32(4, 0x73696478); // 'sidx'
  v.setUint8(8, 0); // version 0
  // flags (9-11) = 0
  v.setUint32(12, 0); // reference_ID
  v.setUint32(16, 1000); // timescale
  v.setUint32(20, 0); // earliest_presentation_time
  v.setUint32(24, 0); // first_offset
  v.setUint16(28, 0); // reserved
  v.setUint16(30, 2); // reference_count

  // entry 0: referenced_size 1000, duration 2000 (=> 2s)
  const size0 = markReferenceType ? 0x80000000 | 1000 : 1000;
  v.setUint32(32, size0);
  v.setUint32(36, 2000);
  v.setUint32(40, 0); // SAP

  // entry 1: referenced_size 2000, duration 3000 (=> 3s)
  v.setUint32(44, 2000);
  v.setUint32(48, 3000);
  v.setUint32(52, 0);

  return buf;
}

describe('parseSidx', () => {
  it('parses timescale, reference count and entries', () => {
    const result = parseSidx(buildSidx());
    expect(result.timescale).toBe(1000);
    expect(result.referenceCount).toBe(2);
    expect(result.entries).toEqual([
      { length: 1000, duration: 2, start: 0 },
      { length: 2000, duration: 3, start: 1000 },
    ]);
  });

  it('masks the reference_type high bit out of the size', () => {
    const result = parseSidx(buildSidx({ markReferenceType: true }));
    expect(result.entries[0].length).toBe(1000);
  });
});
