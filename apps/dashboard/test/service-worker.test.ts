import { describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_MS, watchForUpdates } from '../src/lib/service-worker';

// NTF-07, D7-44: the dashboard moves without full page loads, so it asks for a new version itself: on a timer, and each
// time the person comes back to the tab. That's what lets the "new version" prompt appear without a reload.
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
