'use client';

import { type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';

/** The width from which the bar shows its links and the phone sheet is gone (site.css, 900 px). */
const DESKTOP_QUERY = '(min-width: 900px)';

/** The sketch's floating capsule and its phone sheet. On the landing page (`overHero`) the capsule floats over the
    hero as dark glass and turns to white glass once the hero has scrolled past; on every other page it sits in the
    page's flow, white from the start, so their own first sections are never covered. Under 900 px the burger opens
    the full-screen dark sheet; the sheet is a sibling of the bar, never inside it, because the bar's blur would
    otherwise become the sheet's positioning box. `bar` and `sheet` are server-rendered. */
export function NavShell({
  bar,
  sheet,
  overHero,
  labels,
}: {
  bar: ReactNode;
  sheet: ReactNode;
  overHero: boolean;
  labels: { open: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(!overHero);

  useEffect(() => {
    if (!overHero) return;
    const hero = document.getElementById('hero');
    const update = () => {
      setScrolled(hero ? window.scrollY > hero.offsetHeight - 80 : window.scrollY > 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
    };
  }, [overHero]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onWide = () => {
      if (desktop.matches) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onWide);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onWide);
    };
  }, [open]);

  // Any link in the sheet takes the visitor somewhere, so the sheet closes behind it.
  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  };

  const headerClass = ['nav', overHero ? '' : 'nav-flow', scrolled ? 'scrolled' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <header className={headerClass}>
        <div className="navbar">
          {bar}
          <button
            type="button"
            className="burger"
            aria-label={open ? labels.close : labels.open}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            <Icon name={open ? 'x' : 'menu'} size={20} />
          </button>
        </div>
      </header>
      <div
        id="mobile-menu"
        className={open ? 'mobile-menu open' : 'mobile-menu'}
        onClick={closeOnLink}
      >
        {sheet}
      </div>
    </>
  );
}
