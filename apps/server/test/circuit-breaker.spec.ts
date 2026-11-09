import { describe, expect, it } from 'vitest';
import {
  BREAKER_FAILURES,
  BREAKER_OPEN_MS,
  CircuitBreaker,
  CircuitOpen,
} from '../src/common/circuit-breaker';

// PRF-05: five failures in a row open a circuit; for a minute calls fail fast with no attempt; then one trial decides.
describe('the circuit breaker (PRF-05)', () => {
  function setUp() {
    let now = 1_000_000;
    let attempts = 0;
    const breaker = new CircuitBreaker(() => now);
    const failing = () => {
      attempts += 1;
      return Promise.reject(new Error('away'));
    };
    const working = () => {
      attempts += 1;
      return Promise.resolve('ok');
    };
    return {
      breaker,
      failing,
      working,
      attempts: () => attempts,
      later: (ms: number) => {
        now += ms;
      },
    };
  }

  async function openIt(test: ReturnType<typeof setUp>): Promise<void> {
    for (let index = 0; index < BREAKER_FAILURES; index += 1) {
      await expect(test.breaker.call('meta:a', test.failing)).rejects.toThrow('away');
    }
  }

  it('says once that a closed circuit opened, not again while a trial keeps it open (Phase 6 close-out)', async () => {
    let now = 1_000_000;
    const opened: [string, number][] = [];
    const breaker = new CircuitBreaker(
      () => now,
      undefined,
      undefined,
      (circuit, failures) => {
        opened.push([circuit, failures]);
      },
    );
    const failing = () => Promise.reject(new Error('away'));
    for (let index = 0; index < BREAKER_FAILURES; index += 1) {
      await expect(breaker.call('courier:a', failing)).rejects.toThrow('away');
    }
    expect(opened).toEqual([['courier:a', BREAKER_FAILURES]]);
    now += BREAKER_OPEN_MS;
    await expect(breaker.call('courier:a', failing)).rejects.toThrow('away');
    expect(opened).toHaveLength(1);
  });

  it('opens after five failures in a row and fails fast with no attempt, for that circuit only', async () => {
    const test = setUp();
    await openIt(test);
    await expect(test.breaker.call('meta:a', test.working)).rejects.toBeInstanceOf(CircuitOpen);
    expect(test.attempts()).toBe(BREAKER_FAILURES);
    await expect(test.breaker.call('meta:b', test.working)).resolves.toBe('ok');
  });

  it('a success between failures starts the count again', async () => {
    const test = setUp();
    for (let index = 0; index < BREAKER_FAILURES - 1; index += 1) {
      await expect(test.breaker.call('meta:a', test.failing)).rejects.toThrow('away');
    }
    await test.breaker.call('meta:a', test.working);
    await expect(test.breaker.call('meta:a', test.failing)).rejects.toThrow('away');
    await expect(test.breaker.call('meta:a', test.working)).resolves.toBe('ok');
  });

  it('after the minute, one trial closes it on success, or opens it for another minute on failure', async () => {
    const test = setUp();
    await openIt(test);
    test.later(BREAKER_OPEN_MS);
    await expect(test.breaker.call('meta:a', test.failing)).rejects.toThrow('away');
    await expect(test.breaker.call('meta:a', test.working)).rejects.toBeInstanceOf(CircuitOpen);
    test.later(BREAKER_OPEN_MS);
    await expect(test.breaker.call('meta:a', test.working)).resolves.toBe('ok');
    await expect(test.breaker.call('meta:a', test.working)).resolves.toBe('ok');
  });

  it('counts failures that overlap, as a busy server has them (Phase 7 close-out)', async () => {
    const { breaker, working } = setUp();
    const hanging: ((reason: Error) => void)[] = [];
    const calls = Array.from({ length: BREAKER_FAILURES }, () =>
      breaker
        .call(
          'p',
          () =>
            new Promise((_resolve, reject) => {
              hanging.push(reject);
            }),
        )
        .catch(() => undefined),
    );
    for (const fail of hanging) fail(new Error('away'));
    await Promise.all(calls);
    await expect(breaker.call('p', working)).rejects.toBeInstanceOf(CircuitOpen);
  });

  it('a call from before the circuit opened neither closes nor extends it (Phase 7 close-out)', async () => {
    const { breaker, failing, working, attempts, later } = setUp();
    let failLate: (reason: Error) => void = () => undefined;
    const late = breaker
      .call(
        'p',
        () =>
          new Promise((_resolve, reject) => {
            failLate = reject;
          }),
      )
      .catch(() => undefined);
    let succeedLate: (value: string) => void = () => undefined;
    const slow = breaker.call(
      'p',
      () =>
        new Promise<string>((resolve) => {
          succeedLate = resolve;
        }),
    );
    for (let index = 0; index < BREAKER_FAILURES; index += 1) {
      await expect(breaker.call('p', failing)).rejects.toThrow('away');
    }
    later(BREAKER_OPEN_MS / 2);
    failLate(new Error('away, late'));
    await late;
    succeedLate('ok');
    await slow;
    const before = attempts();
    await expect(breaker.call('p', working)).rejects.toBeInstanceOf(CircuitOpen);
    expect(attempts()).toBe(before);
    // Its minute still runs from when it opened.
    later(BREAKER_OPEN_MS / 2);
    await expect(breaker.call('p', working)).resolves.toBe('ok');
  });

  it('lets only one trial out at a time', async () => {
    const test = setUp();
    await openIt(test);
    test.later(BREAKER_OPEN_MS);
    let finish: () => void = () => undefined;
    const slow = () =>
      new Promise<string>((resolve) => {
        finish = () => {
          resolve('ok');
        };
      });
    const trial = test.breaker.call('meta:a', slow);
    await expect(test.breaker.call('meta:a', test.working)).rejects.toBeInstanceOf(CircuitOpen);
    finish();
    await expect(trial).resolves.toBe('ok');
  });
});
