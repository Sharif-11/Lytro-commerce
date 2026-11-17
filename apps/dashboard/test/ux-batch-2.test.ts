import { describe, expect, it } from 'vitest';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import {
  BACK_ONLINE_MS,
  ConnectionSignal,
  isConnectionFailure,
  netState,
} from '../src/lib/connection';
import {
  TOAST_LONG_MS,
  TOAST_SHORT_MS,
  toastDuration,
  withToast,
  type ToastItem,
} from '../src/hooks/use-toast';
import { openingTopUp, outsideTopUp, quickTopUps } from '../src/views/balance/top-up-words';
import { periodDone } from '../src/views/plan/figures';

// Fixes · UI/UX batch 2: the pure parts of the offline state (1.1), the server's own messages (1.3), the toasts (1.4),
// the top-up's amounts (4.1, 4.4) and the plan's period bar (4.3).

const t = (key: string): string => key;

describe('the offline state (item 1.1)', () => {
  it('reads a fetch that never reached the server as the connection, never a server answer', () => {
    expect(isConnectionFailure(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isConnectionFailure(new Error('anything'), false)).toBe(true);
    expect(isConnectionFailure(new Error('anything'), true)).toBe(false);
    const refused = new ApiClientError('validation_error', 'No.', {}, 400);
    expect(isConnectionFailure(refused, false)).toBe(false);
  });

  it('shows the bar offline, "Back online" for a moment after, then nothing', () => {
    expect(netState(false, null, 1000)).toBe('offline');
    expect(netState(true, 1000, 1000 + BACK_ONLINE_MS - 1)).toBe('back');
    expect(netState(true, 1000, 1000 + BACK_ONLINE_MS)).toBe('online');
    expect(netState(true, null, 5000)).toBe('online');
  });

  it('tells every listener when a change failed for want of a connection, until it leaves', () => {
    const signal = new ConnectionSignal();
    let heard = 0;
    const leave = signal.subscribe(() => {
      heard += 1;
    });
    signal.failed();
    leave();
    signal.failed();
    expect(heard).toBe(1);
  });
});

describe("the server's own message (item 1.3)", () => {
  it("says the server's sentence when it sent one, and keeps a fault's request ID", () => {
    const fault = new ApiClientError(
      'internal_error',
      'সার্ভারে সমস্যা হয়েছে।',
      {},
      500,
      undefined,
      'K7MQ-4XR2',
    );
    expect(errorMessage(fault, t as never)).toBe('সার্ভারে সমস্যা হয়েছে।');
    expect(fault.requestId).toBe('K7MQ-4XR2');
  });
});

describe('the toasts (item 1.4)', () => {
  const item = (id: number, message: string, extra: Partial<ToastItem> = {}): ToastItem => ({
    id,
    message,
    tone: 'success',
    action: null,
    ...extra,
  });

  it('keeps the newest two, the same message once', () => {
    let list: ToastItem[] = [];
    list = withToast(list, item(1, 'Saved'), 2);
    list = withToast(list, item(2, 'Link copied'), 2);
    list = withToast(list, item(3, 'Saved'), 2);
    expect(list.map((each) => each.id)).toEqual([2, 3]);
    list = withToast(list, item(4, 'Moved'), 2);
    expect(list.map((each) => each.message)).toEqual(['Saved', 'Moved']);
  });

  it('holds an error or a toast with an action longer than a plain one', () => {
    expect(toastDuration(item(1, 'Saved'))).toBe(TOAST_SHORT_MS);
    expect(toastDuration(item(1, 'Not saved', { tone: 'error' }))).toBe(TOAST_LONG_MS);
    expect(
      toastDuration(item(1, 'Moved', { action: { label: 'Undo', onClick: () => undefined } })),
    ).toBe(TOAST_LONG_MS);
  });
});

describe('the top-up amounts (items 4.1 and 4.4)', () => {
  it('offers ৳10, ৳20, ৳50 and ৳100 inside the live bounds only', () => {
    expect(quickTopUps({ min: 1, max: 100 })).toEqual([10, 20, 50, 100]);
    expect(quickTopUps({ min: 20, max: 50 })).toEqual([20, 50]);
    expect(quickTopUps({ min: 200, max: 5000 })).toEqual([]);
  });

  it('opens on ৳50, moved inside bounds that leave it out', () => {
    expect(openingTopUp({ min: 1, max: 100 })).toBe(50);
    expect(openingTopUp({ min: 100, max: 5000 })).toBe(100);
    expect(openingTopUp({ min: 1, max: 30 })).toBe(30);
  });

  it('says an amount outside the bounds is out of range, and the bounds themselves are in', () => {
    expect(outsideTopUp(500, { min: 1, max: 100 })).toBe(true);
    expect(outsideTopUp(0, { min: 1, max: 100 })).toBe(true);
    expect(outsideTopUp(1, { min: 1, max: 100 })).toBe(false);
    expect(outsideTopUp(100, { min: 1, max: 100 })).toBe(false);
  });
});

describe("the plan's period bar (item 4.3)", () => {
  it('fills by the days gone of the period, kept between 0 and 100', () => {
    expect(periodDone(20, 1)).toBe(33);
    expect(periodDone(27, 1)).toBe(10);
    expect(periodDone(90, 6)).toBe(50);
    expect(periodDone(40, 1)).toBe(0);
    expect(periodDone(0, 1)).toBe(100);
  });
});
