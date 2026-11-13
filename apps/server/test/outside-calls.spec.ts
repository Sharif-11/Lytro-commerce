import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { BREAKER_FAILURES, CircuitOpen } from '../src/common/circuit-breaker';
import { RequestContext } from '../src/common/request-id/request-context';
import { HOUR_MS } from '../src/common/time';
import { OutsideCalls } from '../src/modules/shared/outside-calls/services/outside-calls';

// PRF-04, PRF-05, D9-17 (Phase 9 Slice 9.5): every outside call's breaker comes from one place, which adds each call to
// the request's outside time and emails the operators when a circuit opens, once an hour for each service.
function setUp(alert = vi.fn(() => Promise.resolve(1))) {
  const requests = new RequestContext();
  const outside = new OutsideCalls(requests, { get: () => ({ alert }) } as unknown as ModuleRef);
  return { requests, outside, alert };
}

const failing = () => Promise.reject(new Error('away'));

async function open(breaker: ReturnType<OutsideCalls['breaker']>, circuit: string): Promise<void> {
  for (let index = 0; index < BREAKER_FAILURES; index += 1) {
    await expect(breaker.call(circuit, failing)).rejects.toThrow('away');
  }
}

describe('outside calls (PRF-04, PRF-05, D9-17)', () => {
  it("adds each call that went out to the request's outside time, and none that the open circuit refused", async () => {
    const { requests, outside } = setUp();
    const breaker = outside.breaker('r2');
    const sums = await requests.run('K7MQ-4XR2', async () => {
      await breaker.call('r2:lytro-media', () => new Promise((resolve) => setTimeout(resolve, 20)));
      await open(breaker, 'r2:lytro-uploads');
      await expect(
        breaker.call('r2:lytro-uploads', () => Promise.resolve(1)),
      ).rejects.toBeInstanceOf(CircuitOpen);
      return requests.outside();
    });
    // One that answered and five that failed went out; the refused one never did.
    expect(sums?.outsideCalls).toBe(1 + BREAKER_FAILURES);
    expect(sums?.outsideMs).toBeGreaterThanOrEqual(15);
    // Outside a request (a queue job) there is nothing to add to, and nothing breaks.
    await breaker.call('r2:lytro-media', () => Promise.resolve(1));
    expect(requests.outside()).toBeUndefined();
  });

  it('emails the operators when a circuit opens, once an hour for each service', async () => {
    let now = 1_000_000;
    const { outside, alert } = setUp();
    const r2 = outside.breaker('r2', { clock: () => now });
    const google = outside.breaker('google', { clock: () => now });
    await open(r2, 'r2:lytro-media');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]).toEqual([
      expect.stringContaining('r2'),
      expect.stringContaining('r2:lytro-media'),
    ]);
    // Another of R2's circuits within the hour: the log names it, the email doesn't come again.
    await open(r2, 'r2:lytro-uploads');
    expect(alert).toHaveBeenCalledTimes(1);
    // Another service is its own.
    await open(google, 'google');
    expect(alert).toHaveBeenCalledTimes(2);
    now += HOUR_MS;
    await open(r2, 'r2:lytro-evidence');
    expect(alert).toHaveBeenCalledTimes(3);
  });

  it('never fails a call because the email could not go or be found', async () => {
    const alert = vi.fn(() => Promise.reject(new Error('mail down')));
    const { outside } = setUp(alert);
    await open(outside.breaker('cloudflare'), 'cloudflare:kv');
    expect(alert).toHaveBeenCalledTimes(1);
    const lost = new OutsideCalls(new RequestContext(), {
      get: () => {
        throw new Error('no such provider');
      },
    } as unknown as ModuleRef);
    await open(lost.breaker('facebook'), 'facebook');
  });
});
