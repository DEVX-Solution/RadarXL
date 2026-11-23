import { sleep } from './retry.js';

export class RateLimiter {
  constructor({ minTime = 0, concurrency = 1 } = {}) {
    this.minTime = minTime;
    this.concurrency = concurrency;
    this.active = 0;
    this.lastStart = 0;
    this.queue = [];
  }

  schedule(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.#drain();
    });
  }

  async #drain() {
    if (this.active >= this.concurrency || this.queue.length === 0) return;
    const item = this.queue.shift();
    this.active += 1;
    const wait = Math.max(0, this.minTime - (Date.now() - this.lastStart));
    if (wait) await sleep(wait);
    this.lastStart = Date.now();

    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        this.active -= 1;
        this.#drain();
      });

    this.#drain();
  }
}
