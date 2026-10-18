'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Wordmark } from '@/components/ui/wordmark';

export interface MenuLink {
  href: string;
  label: string;
}

/** The hamburger and its full-height sheet, shown under the desktop breakpoint. Every row is 48 px tall. */
export function MobileMenu({
  links,
  login,
  cta,
  labels,
}: {
  links: MenuLink[];
  login: MenuLink;
  cta: MenuLink;
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

  return (
    <>
      <button
        type="button"
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink hover:bg-neutral-100 lg:hidden"
      >
        <Icon name={open ? 'x' : 'menu'} size={24} />
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <Wordmark height={28} />
            <button
              type="button"
              aria-label={labels.close}
              onClick={() => {
                setOpen(false);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-control hover:bg-neutral-100"
            >
              <Icon name="x" size={24} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => {
                  setOpen(false);
                }}
                className="flex min-h-12 items-center justify-between border-b border-line text-[17px] font-semibold text-ink"
              >
                {link.label}
                <Icon name="arrow" size={18} className="text-neutral-500" />
              </Link>
            ))}
          </nav>
          <div className="grid gap-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <a href={login.href} className={buttonClass('outline', 'lg')}>
              {login.label}
            </a>
            <a href={cta.href} className={buttonClass('accent', 'lg')}>
              {cta.label}
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
