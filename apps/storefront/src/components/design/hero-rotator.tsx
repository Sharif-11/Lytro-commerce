'use client';

import { type ReactNode, useEffect, useState } from 'react';

// SB-8: a hero of more than one slide shows one at a time, the next every few seconds unless the shopper asked for less
// motion, and a dot for each lets them choose.
const NEXT_AFTER_MS = 6_000;

export function HeroRotator({ slides, label }: { slides: ReactNode[]; label: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setShown((at) => (at + 1) % slides.length);
    }, NEXT_AFTER_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [slides.length]);
  return (
    <>
      {slides[shown]}
      {slides.length > 1 ? (
        <div className="sb-dots" role="tablist" aria-label={label}>
          {slides.map((_, at) => (
            <i
              key={at}
              role="tab"
              aria-selected={at === shown}
              tabIndex={0}
              className={at === shown ? 'sb-on' : undefined}
              onClick={() => {
                setShown(at);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setShown(at);
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
