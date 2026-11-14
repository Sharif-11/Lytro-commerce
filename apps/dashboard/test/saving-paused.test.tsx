import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@lytronix/api-client';
import { useRefusedSaving } from '../src/hooks/use-saving-paused';
import { createQueryClient } from '../src/lib/query-client';
import { isSavingPaused, SavingPausedSignal } from '../src/lib/saving-paused';

// D9-14 (Slice 9.9): the can't-save banner's state -- which answer says it, how long a refusal holds, and that a save
// going through ends it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function refusal(
  details: Record<string, unknown>,
  status = 503,
  retryAfter?: number,
): ApiClientError {
  return new ApiClientError('service_unavailable', '', details, status, retryAfter);
}

describe("the server's can't-save answer", () => {
  it('is a 503 whose details say savingPaused, and nothing else', () => {
    expect(isSavingPaused(refusal({ savingPaused: true }, 503, 30))).toBe(true);
    // Degraded mode's PausedForLoad, a courier or a provider not answering: other 503s.
    expect(isSavingPaused(refusal({}, 503, 300))).toBe(false);
    expect(isSavingPaused(refusal({ courierKey: 'steadfast' }, 503, 60))).toBe(false);
    expect(isSavingPaused(refusal({ savingPaused: 'yes' }))).toBe(false);
    expect(isSavingPaused(refusal({ savingPaused: true }, 500))).toBe(false);
    expect(isSavingPaused(new ApiClientError('conflict', '', { savingPaused: true }, 503))).toBe(
      false,
    );
    expect(isSavingPaused(new Error('offline'))).toBe(false);
  });
});

describe('SavingPausedSignal', () => {
  it('holds a refusal for its retry hint, and a save going through ends it', () => {
    let now = 1_000_000;
    const signal = new SavingPausedSignal(() => now);
    const heard = vi.fn();
    signal.subscribe(heard);
    expect(signal.paused()).toBe(false);

    signal.refused(refusal({ savingPaused: true }, 503, 30));
    expect(signal.snapshot()).toBe(1_030_000);
    expect(signal.paused()).toBe(true);
    now += 29_999;
    expect(signal.paused()).toBe(true);
    now += 1;
    expect(signal.paused()).toBe(false);

    signal.refused(refusal({ savingPaused: true }, 503, 30));
    signal.saved();
    expect(signal.paused()).toBe(false);
    expect(signal.snapshot()).toBe(0);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('waits 30 seconds when the server names no wait', () => {
    const signal = new SavingPausedSignal(() => 0);
    signal.refused(refusal({ savingPaused: true }));
    expect(signal.snapshot()).toBe(30_000);
  });

  it('says nothing to its listeners when a save goes through and none was refused', () => {
    const signal = new SavingPausedSignal(() => 0);
    const heard = vi.fn();
    signal.subscribe(heard);
    signal.saved();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("the query client's report", () => {
  it('hears a refused query or save, and a save that goes through', async () => {
    const signal = new SavingPausedSignal();
    const client = createQueryClient(signal);
    await client
      .getQueryCache()
      .build(client, {
        queryKey: ['refused'],
        queryFn: () => Promise.reject(refusal({ savingPaused: true }, 503, 30)),
        retry: false,
      })
      .fetch()
      .catch(() => undefined);
    expect(signal.paused()).toBe(true);

    const save = client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.resolve('ok') });
    await save.execute(undefined);
    expect(signal.paused()).toBe(false);

    const other = client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(refusal({}, 503, 300)) });
    await other.execute(undefined).catch(() => undefined);
    expect(signal.paused()).toBe(false);
  });
});

describe('useRefusedSaving', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    host.remove();
  });

  it('shows from a refusal until its wait lapses, and again after the next refusal', () => {
    const signal = new SavingPausedSignal();
    function Probe(): React.JSX.Element {
      return <p>{useRefusedSaving(signal) ? 'paused' : 'saving'}</p>;
    }
    const root = createRoot(host);
    act(() => {
      root.render(<Probe />);
    });
    expect(host.textContent).toBe('saving');

    act(() => {
      signal.refused(refusal({ savingPaused: true }, 503, 30));
    });
    expect(host.textContent).toBe('paused');
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(host.textContent).toBe('paused');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(host.textContent).toBe('saving');

    act(() => {
      signal.refused(refusal({ savingPaused: true }, 503, 30));
    });
    expect(host.textContent).toBe('paused');
    act(() => {
      signal.saved();
    });
    expect(host.textContent).toBe('saving');
    act(() => {
      root.unmount();
    });
  });
});
