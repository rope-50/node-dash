/**
 * A thin wrapper around an MSE `SourceBuffer` with an append queue.
 *
 * `appendBuffer` is asynchronous: you cannot call it again until the previous
 * append fires `updateend`. This class queues chunks and drains them one at a
 * time, which replaces the ad-hoc `sourceBuffer.queue` logic in the original.
 */
export class BufferQueue {
  /**
   * @param {MediaSource} mediaSource
   * @param {string} mimeCodec - e.g. `video/mp4;codecs="avc1.4d401f"`.
   */
  constructor(mediaSource, mimeCodec) {
    this.sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
    this.queue = [];
    this.sourceBuffer.addEventListener('updateend', () => this.#drain());
  }

  /** Queues a chunk for appending. */
  append(chunk) {
    this.queue.push(chunk);
    this.#drain();
  }

  /** Resolves once the queue is empty and the SourceBuffer is no longer updating. */
  whenIdle() {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.sourceBuffer.updating && this.queue.length === 0) resolve();
        else setTimeout(check, 30);
      };
      check();
    });
  }

  #drain() {
    if (this.sourceBuffer.updating || this.queue.length === 0) return;
    this.sourceBuffer.appendBuffer(this.queue.shift());
  }
}
