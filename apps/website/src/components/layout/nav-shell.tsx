'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

export interface MenuLink {
  href: string;
  label: string;
}

/** The bar and its phone sheet, exactly as the sketch lays them out: a 64 px sticky bar, and under the
    desktop breakpoint a burger that opens a white panel filling the screen below the bar. The panel is a
    sibling of the bar, never inside it, because the bar's blur would otherwise become the panel's
    positioning box. `bar` is the server-rendered content of the bar (wordmark, links, toggle, buttons). */
export function NavShell({
  bar,
  links,
  login,
  cta,
  note,
  labels,
}: {
  bar: ReactNode;
  links: MenuLink[];
  login: MenuLink;
  cta: MenuLink;
  note: string;
  labels: { open: string; close: string };
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1160px] items-center gap-2 px-4 sm:px-6 lg:px-8">
          {bar}
          <button
            type="button"
            aria-label={open ? labels.close : labels.open}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => {
              setOpen((value) => !value);
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-white text-ink hover:bg-neutral-50 lg:hidden"
          >
            <Icon name={open ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </header>

      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-white lg:hidden"
      >
        <nav
          aria-label="Menu"
          className="mx-auto grid w-full max-w-[1160px] gap-1 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className="flex min-h-12 items-center rounded-control px-3 text-[18px] font-semibold text-ink hover:bg-neutral-50"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={login.href}
            className="flex min-h-12 items-center rounded-control px-3 text-[18px] font-semibold text-ink hover:bg-neutral-50"
          >
            {login.label}
          </a>
          <a href={cta.href} className={`mt-3 ${buttonClass('accent', 'lg')}`}>
            {cta.label}
          </a>
          <p className="mt-4 px-3 text-[14px] text-neutral-700">{note}</p>
        </nav>
      </div>
    </>
  );
}
