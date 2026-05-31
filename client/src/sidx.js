/**
 * Parses an MP4 `sidx` (Segment Index) box.
 *
 * In the DASH on-demand profile a representation is a single file laid out as
 * `[ftyp + moov][sidx][media subsegments]`. The `sidx` box lists, for each media
 * subsegment, its byte length and duration, which is exactly what we need to
 * request subsegments by HTTP byte-range and to map them onto a timeline.
 *
 * Box layout parsed here (big-endian):
 *   size(4) type(4) version(1) flags(3) reference_ID(4) timescale(4)
 *   earliest_presentation_time + first_offset (8 if version 0, else 16)
 *   reserved(2) reference_count(2)
 *   then reference_count entries of: referenced_size(4) duration(4) SAP(4)
 *
 * @param {ArrayBuffer} arrayBuffer - The bytes of the `sidx` box.
 * @returns {{ timescale: number, referenceCount: number,
 *             entries: Array<{ length: number, duration: number, start: number }> }}
 *   `length` is the subsegment size in bytes, `duration` is in seconds, and
 *   `start` is the cumulative byte offset of the subsegment within the media run.
 */
export function parseSidx(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let pos = 12; // skip size(4) + type(4) + version(1) + flags(3)
  const version = view.getUint8(8);

  pos += 4; // skip reference_ID
  const timescale = view.getUint32(pos);
  pos += 4;
  pos += version === 0 ? 8 : 16; // earliest_presentation_time + first_offset
  pos += 2; // reserved
  const referenceCount = view.getUint16(pos);
  pos += 2;

  const entries = [];
  let start = 0;
  for (let i = 0; i < referenceCount; i++) {
    // High bit of referenced_size is reference_type; mask it off.
    const length = view.getUint32(pos) & 0x7fffffff;
    const duration = view.getUint32(pos + 4);
    pos += 12; // referenced_size(4) + subsegment_duration(4) + SAP(4)
    entries.push({ length, duration: duration / timescale, start });
    start += length;
  }

  return { timescale, referenceCount, entries };
}
