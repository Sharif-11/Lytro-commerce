import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { CourierCallAction, CourierKey } from '@lytronix/validators';
import { RequestContext } from '../src/common/request-id/request-context';
import { HOUR_MS } from '../src/common/time';
import type { CourierStore } from '../src/modules/couriers/ports/courier-store';
import { CourierCalls } from '../src/modules/couriers/services/courier-calls';
import { OutsideCalls } from '../src/modules/shared/outside-calls/services/outside-calls';

// PRF-05, carried in from the Phase 6 close-out, and FRD-11: an opened courier circuit alerts the operators, once an hour
// for one courier however many shops' circuits open; a fraud check that keeps failing never stops the shop's bookings.
const adapter = { key: CourierKey.Steadfast };

function setUp() {
  let now = new Date('2026-11-08T06:00:00Z').getTime();
  const alert = vi.fn(() => Promise.resolve(1));
  const store = { recordUse: () => Promise.resolve() } as unknown as CourierStore;
  // The shared breakers (Slice 9.5) find the operators' email when a circuit first opens.
  const outside = new OutsideCalls(new RequestContext(), {
    get: () => ({ alert }),
  } as unknown as ModuleRef);
  const calls = new CourierCalls(store, () => new Date(now), outside);
  const failing = () => Promise.reject(new Error('away'));
  const fail = async (
    tenantId: string,
    action: CourierCallAction = CourierCallAction.Book,
    times = 5,
  ) => {
    for (let index = 0; index < times; index += 1) {
      await expect(
        calls.run(adapter, { tenantId, connectionId: 'c', orderId: null, action }, failing),
      ).rejects.toThrow();
    }
  };
  return {
    calls,
    alert,
    fail,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe('a courier circuit (PRF-05, FRD-11)', () => {
  it('tells the operators when it opens, once an hour for that courier', async () => {
    const { alert, fail, later } = setUp();
    await fail('shop-a');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]).toEqual([
      expect.stringContaining('steadfast'),
      expect.stringContaining('shop-a'),
    ]);
    await fail('shop-b');
    expect(alert).toHaveBeenCalledTimes(1);
    later(HOUR_MS);
    await fail('shop-c');
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('never fails because the alert could not go', async () => {
    const { alert, fail } = setUp();
    alert.mockRejectedValueOnce(new Error('mail down'));
    await fail('shop-a');
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("leaves a shop's bookings alone when its fraud checks keep failing", async () => {
    const { calls, fail } = setUp();
    await fail('shop-a', CourierCallAction.FraudCheck);
    const booked = await calls.run(
      adapter,
      { tenantId: 'shop-a', connectionId: 'c', orderId: null, action: CourierCallAction.Book },
      () => Promise.resolve({ outcome: 'booked' }),
    );
    expect(booked.outcome).toBe('booked');
  });
});
