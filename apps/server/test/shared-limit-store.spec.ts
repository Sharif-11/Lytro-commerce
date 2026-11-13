import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { SharedLimitStore } from '../src/modules/shared/limits/services/shared-limit-store';

// D9-15, RED-02 to RED-05 (Slice 9.4; the owner's answers 2026-11-13: "half each", "one email"): the store every rate
// limit uses. Redis while it answers; memory at the full limit where there's no Redis; memory at half while Redis is
// down; one email when an outage is real (three failed tries, after a start-up's grace) and one when it ends.

const MINUTE_MS = 60_000;

/** A stand-in Redis: the window script's answer while up, a refusal while down. */
class FakeRedis {
  up = true;
  evals = 0;

  eval(): Promise<unknown> {
    this.evals += 1;
    return this.up
      ? Promise.resolve([1, 9, MINUTE_MS])
      : Promise.reject(new Error('connection refused'));
  }

  ping(): Promise<string> {
    return this.up ? Promise.resolve('PONG') : Promise.reject(new Error('connection refused'));
  }

  disconnect(): void {
    // Nothing to close.
  }
}

function outage() {
  return { down: vi.fn(() => Promise.resolve()), up: vi.fn(() => Promise.resolve()) };
}

function storeOver(redis: FakeRedis | null, reported = outage()): SharedLimitStore {
  return new SharedLimitStore(redis as unknown as Redis | null, reported);
}

async function allowedOf(store: SharedLimitStore, limit: number, tries: number): Promise<number> {
  let allowed = 0;
  for (let index = 0; index < tries; index += 1) {
    if ((await store.take('bucket', limit, MINUTE_MS, new Date())).allowed) allowed += 1;
  }
  return allowed;
}

describe('the shared limit store (Slice 9.4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts in memory, at the full limit, where no Redis is configured', async () => {
    const store = storeOver(null);
    expect(await allowedOf(store, 3, 5)).toBe(3);
    expect(store.state()).toBe('not_configured');
  });

  it('asks Redis while it answers, and gives its answer as it is', async () => {
    const redis = new FakeRedis();
    const store = storeOver(redis);
    await expect(store.take('bucket', 10, MINUTE_MS, new Date())).resolves.toEqual({
      allowed: true,
      remaining: 9,
      resetMs: MINUTE_MS,
    });
    expect(redis.evals).toBe(1);
    expect(store.state()).toBe('up');
  });

  it('counts in memory at half the limit the moment Redis fails, so two processes stay about the limit (RED-05)', async () => {
    vi.useFakeTimers();
    const redis = new FakeRedis();
    redis.up = false;
    const store = storeOver(redis);
    expect(await allowedOf(store, 10, 10)).toBe(5);
    expect(store.state()).toBe('down');
    // Once down, it stops asking Redis until a try says it's back.
    expect(redis.evals).toBe(1);
    store.onModuleDestroy();
  });

  it('tells of an outage once, after three failed tries, and of its end once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
    const redis = new FakeRedis();
    const reported = outage();
    const store = storeOver(redis, reported);
    // Past the start-up's grace.
    vi.setSystemTime(new Date('2026-11-13T00:01:00Z'));
    redis.up = false;
    await store.take('bucket', 10, MINUTE_MS, new Date());

    await vi.advanceTimersByTimeAsync(10_000);
    expect(reported.down).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reported.down).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(reported.down).toHaveBeenCalledTimes(1);

    redis.up = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reported.up).toHaveBeenCalledTimes(1);
    expect(store.state()).toBe('up');
    expect(await allowedOf(store, 10, 1)).toBe(1);
    store.onModuleDestroy();
  });

  it('sends no email for a Redis that a just-started process is still reaching (a deploy is not an outage)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
    const redis = new FakeRedis();
    redis.up = false;
    const reported = outage();
    const store = storeOver(redis, reported);
    await store.take('bucket', 10, MINUTE_MS, new Date());
    await vi.advanceTimersByTimeAsync(10_000);
    redis.up = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reported.down).not.toHaveBeenCalled();
    expect(store.state()).toBe('up');
    store.onModuleDestroy();
  });
});
