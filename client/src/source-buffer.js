/**
 * A thin wrapper around an MSE `SourceBuffer` with an operation queue.
 *
 * `appendBuffer` is asynchronous: you cannot call it (or `changeType`) again
 * until the previous operation fires `updateend`. This class queues operations
 * (appends and codec changes) and drains them one at a time.
 *
 * `changeType` is needed when switching to a representation with a different
 * codec string (e.g. avc1.64000d at 180p vs avc1.640028 at 1080p).
 */
export class BufferQueue {
  /**
   * @param {MediaSource} mediaSource
   * @param {string} mimeCodec - e.g. `video/mp4;codecs="avc1.64000d"`.
   */
  constructor(mediaSource, mimeCodec) {
    this.sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
    this.ops = [];
    this.sourceBuffer.addEventListener('updateend', () => this.#drain());
  }

  /** Queues a chunk (ArrayBuffer) for appending. */
  append(chunk) {
    this.ops.push({ kind: 'append', data: chunk });
    this.#drain();
  }

  /** Queues a codec change, applied before the following appends. */
  changeType(mimeCodec) {
    this.ops.push({ kind: 'changeType', mimeCodec });
    this.#drain();
  }

  /** Resolves once the queue is empty and the SourceBuffer is no longer updating. */
  whenIdle() {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.sourceBuffer.updating && this.ops.length === 0) resolve();
        else setTimeout(check, 30);
      };
      check();
    });
  }

  #drain() {
    if (this.sourceBuffer.updating || this.ops.length === 0) return;
    const op = this.ops.shift();
    if (op.kind === 'changeType') {
      this.sourceBuffer.changeType(op.mimeCodec);
      this.#drain(); // changeType is synchronous; continue with the next op
    } else {
      this.sourceBuffer.appendBuffer(op.data);
    }
  }
}
