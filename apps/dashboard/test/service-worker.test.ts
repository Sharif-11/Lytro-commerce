import { describe, expect, it, vi } from 'vitest';
import { ServiceWorkerState, UPDATE_CHECK_MS, watchForUpdates } from '../src/lib/service-worker';

// NTF-07: the dashboard moves without full page loads, so it asks for a new version itself: on a timer, and each time the
// person comes back to the tab. That's what lets a new version be found without a reload.
function setUp(visibilityState: DocumentVisibilityState) {
  const registration = { update: vi.fn(() => Promise.resolve(undefined)) };
  const listeners: (() => void)[] = [];
  const page = {
    visibilityState,
    addEventListener: (_name: string, listener: () => void) => {
      listeners.push(listener);
    },
  };
  let tick: () => void = () => undefined;
  let every = 0;
  watchForUpdates(
    registration as unknown as ServiceWorkerRegistration,
    page as unknown as Document,
    (run, ms) => {
      tick = run;
      every = ms;
    },
  );
  return {
    registration,
    page,
    listeners,
    tick: () => {
      tick();
    },
    every: () => every,
  };
}

describe('asking for a new version (NTF-07)', () => {
  it('asks on a timer', () => {
    const { registration, tick, every } = setUp('visible');
    expect(every()).toBe(UPDATE_CHECK_MS);
    expect(registration.update).not.toHaveBeenCalled();
    tick();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('asks when the person comes back to the tab, not when they leave it', () => {
    const away = setUp('hidden');
    away.listeners[0]?.();
    expect(away.registration.update).not.toHaveBeenCalled();
    const back = setUp('visible');
    back.listeners[0]?.();
    expect(back.registration.update).toHaveBeenCalledTimes(1);
  });

  it('shrugs off a failed check, offline say', () => {
    const { registration, tick } = setUp('visible');
    registration.update.mockRejectedValueOnce(new Error('offline'));
    expect(() => {
      tick();
    }).not.toThrow();
  });
});

// NTF-07 as amended 2026-11-25 (the owner: "can't we do it automatically", at the "Next page change"): no prompt; a new
// version takes over at the next in-app page change, or at once on a fresh start.
const worker = () => ({ postMessage: vi.fn() });

describe('taking a new version by itself (NTF-07)', () => {
  it('takes a waiting version at the next page change, once', () => {
    const state = new ServiceWorkerState();
    const waiting = worker();
    state.started({ waiting: null }, true);
    // A version installs while the page is open: it waits for the next page change.
    (state as unknown as { setWaiting: (w: unknown) => void }).setWaiting(waiting);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    state.pageChanged();
    state.pageChanged();
    expect(waiting.postMessage).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('does nothing at a page change with no new version waiting', () => {
    const state = new ServiceWorkerState();
    expect(() => {
      state.pageChanged();
    }).not.toThrow();
    expect(state.updateReady()).toBe(false);
  });

  it('takes a version already waiting at a fresh start, before anything is typed', () => {
    const state = new ServiceWorkerState();
    const waiting = worker();
    state.started({ waiting: waiting as unknown as ServiceWorker }, true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('leaves a first install alone: with no page in control there is no version to replace', () => {
    const state = new ServiceWorkerState();
    const waiting = worker();
    state.started({ waiting: waiting as unknown as ServiceWorker }, false);
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });
});
