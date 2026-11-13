'use client';

import { useEffect, useState } from 'react';

/** The sketch's phone-only start bar (LANDING-PAGE-DESIGN.md §4): a dark capsule that slides in once the hero has
    scrolled away and slides out again at the final band, where the same button already sits. Gone from 900 px
    (site.css), where the bar's own button is always in view. */
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
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero)
            heroGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          if (entry.target === end) endNear = entry.isIntersecting;
        }
        setVisible(heroGone && !endNear);
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
    <div className={visible ? 'sticky-cta show' : 'sticky-cta'} aria-hidden={!visible}>
      <div className="sub">
        <b>{title}</b>
        <span>{subtitle}</span>
      </div>
      <a href={href} className="btn btn-accent" tabIndex={visible ? 0 : -1}>
        {action}
      </a>
    </div>
  );
}
