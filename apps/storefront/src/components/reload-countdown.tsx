'use client';

import { useEffect, useMemo, useState } from 'react';
import { type Language, Words } from '@/lib/i18n/words';
import { Icon } from './icon';

/** Part 910 (`p910-busy`): the clock line under Try again, counting down the server's wait, then loading the page again
    by itself. It counts from the clock, not from the ticks, so a phone that slept still reloads on time. */
export function ReloadCountdown({ language, seconds }: { language: Language; seconds: number }) {
  const words = useMemo(() => new Words(language), [language]);
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        window.location.reload();
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [seconds]);
  return (
    <div className="auto">
      <Icon name="clock" />
      <span>{words.t('p910BusyAuto', { n: words.digits(left) })}</span>
    </div>
  );
}
