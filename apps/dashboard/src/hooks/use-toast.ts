import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_MS = 2600;

/** A message that shows for a moment after a save or a change, then clears itself. */
export function useToast(): { message: string | null; show: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setMessage(null);
    }, SHOW_MS);
  }, []);

  return { message, show };
}
