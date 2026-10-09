import { useEffect, useState } from 'react';

/** Counts down from `seconds` to 0, one tick per second. Restarts whenever `seconds` itself changes
    (e.g. a fresh OTP request resets the resend/expiry windows). */
export function useCountdown(seconds: number): number {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) return;
    const interval = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [seconds]);

  return remaining;
}
