'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PublicCategory } from '@/lib/api/storefront-api';
import { type Language, Words } from '@/lib/i18n/words';
import type { ChatLink } from '@/lib/shop/shop-chat';
import { Icon } from '../icon';
import { LanguageSwitch } from '../language-switch';
import { DesignIcon } from './design-icon';

// The owner, 2026-11-19, beside Bonik AI (the sketch's `v-menu`): on a phone the header's menu opens a drawer of the
// shop's lists, its categories with their counts, help and the language. It is drawn into the page's frame, out of
// the header: the header is a container, which would hold a fixed panel inside its own box.

export function MenuDrawer({
  shopName,
  categories,
  whatsapp,
  language,
  variables,
  current,
  offers,
}: {
  shopName: string;
  categories: readonly PublicCategory[];
  /** SFT-21: the shop's WhatsApp, where it gave one. */
  whatsapp: ChatLink | null;
  language: Language;
  /** The theme's tokens, which the drawer wears as the header does. */
  variables: Record<string, string>;
  /** Which of the lists the page is ('all', 'offers' or a category's link), lit in the drawer. */
  current: string | null;
  /** The owner, 2026-11-25: whether anything is on sale, so the অফার row shows. */
  offers: boolean;
}) {
  const words = new Words(language);
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState<Element | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setFrame(button.current?.closest('.frame') ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      button.current?.focus();
    };
  }, [open]);

  const row = (
    href: string,
    label: string,
    lit: boolean,
    end: React.ReactNode,
    icon?: React.ReactNode,
  ) => (
    <a className={lit ? 'sb-row sb-on' : 'sb-row'} href={href}>
      {icon}
      <span>{label}</span>
      {end}
    </a>
  );
  const go = (
    <span className="sb-go">
      <Icon name="chev" />
    </span>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className="sb-menu"
        aria-label={words.t('menu')}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        <DesignIcon name="menu" />
      </button>
      {open && frame
        ? createPortal(
            <div className="sfb sb-drawer-root" style={variables}>
              <div
                className="sb-dscrim"
                onClick={() => {
                  setOpen(false);
                }}
              />
              <nav
                className="sb-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={words.t('menu')}
              >
                <div className="sb-dh">
                  <b>{shopName}</b>
                  <button
                    ref={close}
                    type="button"
                    aria-label={words.t('close')}
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    <Icon name="x" />
                  </button>
                </div>
                {row('/new', words.t('sb_all'), current === 'all', go)}
                {offers ? row('/offers', words.t('sb_offers'), current === 'offers', go) : null}
                {categories.length > 0 ? (
                  <>
                    <div className="sb-lab">{words.t('categories')}</div>
                    {categories.map((category) => (
                      <a
                        key={category.id}
                        className={current === category.slug ? 'sb-row sb-on' : 'sb-row'}
                        href={`/c/${category.slug}`}
                      >
                        <span>{category.name}</span>
                        <span className="sb-n">{String(category.productCount)}</span>
                      </a>
                    ))}
                  </>
                ) : null}
                <div className="sb-lab">{words.t('sb_help')}</div>
                {row('/track', words.t('sb_track'), false, go, <DesignIcon name="truck" />)}
                {row('/account', words.t('sb_my_account'), false, go, <DesignIcon name="user" />)}
                {whatsapp ? (
                  <a
                    className="sb-row"
                    href={whatsapp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="wa" />
                    <span>{words.t('sb_chat_whatsapp')}</span>
                  </a>
                ) : null}
                <div className="sb-lab">{words.t('sb_language')}</div>
                <LanguageSwitch language={language} as="both" />
              </nav>
            </div>,
            frame,
          )
        : null}
    </>
  );
}
