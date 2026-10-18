'use client';

import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui/button';

/** The phone-only bottom bar (LANDING-PAGE-DESIGN.md §4): appears once the hero has scrolled away and
    hides again near the final band, where the same button already sits. Hidden from the tablet size up. */
export function StickyCta({
  href,
  title,
  subtitle,
  action,
}: {
  href: string;
  title: string;
  subtitle: string;
  action: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('hero');
    const end = document.getElementById('final-cta');
    if (!hero || !end) return;
    let heroGone = false;
    let endNear = false;
    const update = () => {
      setVisible(heroGone && !endNear);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero)
            heroGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          if (entry.target === end) endNear = entry.isIntersecting;
        }
        update();
      },
      { threshold: 0 },
    );
    observer.observe(hero);
    observer.observe(end);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(16,32,31,0.25)] backdrop-blur-md transition-transform duration-200 sm:hidden ${visible ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-ink">{title}</p>
          <p className="truncate text-[13px] text-neutral-700">{subtitle}</p>
        </div>
        <a
          href={href}
          className={buttonClass('accent', 'md', 'shrink-0')}
          tabIndex={visible ? 0 : -1}
        >
          {action}
        </a>
      </div>
    </div>
  );
}
