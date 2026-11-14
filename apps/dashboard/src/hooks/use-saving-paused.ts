import { useEffect, useState, useSyncExternalStore } from 'react';
import { type SavingPausedSignal, savingPausedSignal } from '@/lib/saving-paused';

/**
 * D9-14 (Slice 9.9): whether a refused save still holds -- true from the refusal until its retry hint lapses or a save
 * goes through, so the banner stays up for as long as the server asked the page to wait, and no longer.
 */
export function useRefusedSaving(signal: SavingPausedSignal = savingPausedSignal): boolean {
  const until = useSyncExternalStore(signal.subscribe, signal.snapshot);
  // The refusal whose wait has run out; a later refusal holds again.
  const [lapsed, setLapsed] = useState(0);
  useEffect(() => {
    if (until === 0) return;
    const timer = window.setTimeout(
      () => {
        setLapsed(until);
      },
      Math.max(0, until - Date.now()),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [until]);
  return until !== 0 && lapsed !== until;
}
