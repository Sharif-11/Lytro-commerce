/** What a bucket allowed: whether the request may go, how many more may, and when the oldest leaves the window. */
export interface WindowVerdict {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until a request leaves the window and frees a place. */
  resetMs: number;
}

/**
 * RTE-01, D3-2: an exact sliding window, in memory: each bucket keeps the times of the requests it let through in
 * the last window, so a limit of 60 a minute means 60 in any 60 seconds, not 60 per clock minute. Exact while there
 * is one server; Phase 9 moves the buckets to the shared Redis behind the same calls.
 */
export class SlidingWindow {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly windowMs: number) {}

  /** Counts a request in the bucket if it is under the limit. A refused request is not counted. */
  take(bucket: string, limit: number, now: number): WindowVerdict {
    const times = this.live(bucket, now);
    if (times.length >= limit) {
      return { allowed: false, remaining: 0, resetMs: this.resetOf(times, now) };
    }
    times.push(now);
    this.buckets.set(bucket, times);
    return { allowed: true, remaining: limit - times.length, resetMs: this.resetOf(times, now) };
  }

  /** Drops the buckets with nothing left in the window, so memory follows live traffic. */
  sweep(now: number): void {
    for (const bucket of [...this.buckets.keys()]) {
      if (this.live(bucket, now).length === 0) this.buckets.delete(bucket);
    }
  }

  private live(bucket: string, now: number): number[] {
    const times = this.buckets.get(bucket) ?? [];
    const from = now - this.windowMs;
    let first = 0;
    while (first < times.length && (times[first] ?? now) <= from) first += 1;
    if (first === 0) return times;
    const kept = times.slice(first);
    this.buckets.set(bucket, kept);
    return kept;
  }

  private resetOf(times: number[], now: number): number {
    const oldest = times[0];
    return oldest === undefined ? 0 : Math.max(oldest + this.windowMs - now, 0);
  }
}
