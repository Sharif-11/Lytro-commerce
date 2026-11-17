import { useEffect, useState } from 'react';

/** After this long a load says the connection seems slow (the prototype's `ux-loading-slow`). */
export const SLOW_AFTER_MS = 8000;

/** Whether a load has taken longer than {@link SLOW_AFTER_MS}, counted from when the caller first drew. */
export function useSlow(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSlow(true);
    }, SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  return slow;
}
