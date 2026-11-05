import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@lytronix/api-client';

const WINDOW_SECONDS = 15 * 60;

/** Whether the server has locked the account (ADM-01): refused outright, or that was the last try allowed. */
export function isLockedOut(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.code === 'rate_limited' || error.details.attemptsLeft === 0)
  );
}

/** A locked account sees the wait and a disabled button until the server would answer again. */
export function useLockout(): {
  locked: boolean;
  start: (error: unknown) => void;
  clear: () => void;
} {
  const [locked, setLocked] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  return {
    locked,
    start: (error) => {
      const seconds = error instanceof ApiClientError ? error.retryAfterSeconds : undefined;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => {
          setLocked(false);
        },
        (seconds ?? WINDOW_SECONDS) * 1000,
      );
      setLocked(true);
    },
    clear: () => {
      window.clearTimeout(timer.current);
      setLocked(false);
    },
  };
}
