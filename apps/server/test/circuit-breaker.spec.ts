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
