import { MINUTE_MS } from '../../../../common/time';
import { SlidingWindow, type WindowVerdict } from '../../../../common/sliding-window';
import type { LimitStore } from '../ports/limit-store';

/**
 * Slice 9.4: the limit store in this process's memory -- exact for one process. It answers where there's no Redis (a
 * developer's machine, the tests), and stands in while the shared Redis is down (SharedLimitStore halves the limits it
 * asks of it then). One sliding window per length; buckets nobody uses are dropped every minute.
 */
export class MemoryLimitStore implements LimitStore {
  private readonly windows = new Map<number, SlidingWindow>();
  private sweeper: NodeJS.Timeout | null = null;

  start(): void {
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const window of this.windows.values()) window.sweep(now);
    }, MINUTE_MS);
    this.sweeper.unref();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  take(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict> {
    return Promise.resolve(this.window(windowMs).take(bucket, limit, now.getTime()));
  }

  peek(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict> {
    return Promise.resolve(this.window(windowMs).peek(bucket, limit, now.getTime()));
  }

  private window(windowMs: number): SlidingWindow {
    let window = this.windows.get(windowMs);
    if (!window) {
      window = new SlidingWindow(windowMs);
      this.windows.set(windowMs, window);
    }
    return window;
  }
}
