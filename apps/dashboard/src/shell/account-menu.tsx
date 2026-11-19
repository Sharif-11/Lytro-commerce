import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSignOut } from '@/api/me';
import { Icon } from '@/components/icon';
import { useShell } from './shell-context';

/**
 * The initial in a computer's top bar, which opens your menu (the owner, 2026-11-19, the sketch's `bb-account`): you and
 * your role, Account, the language, and Sign out -- two clicks, and hard to hit by mistake. No "are you sure": signing
 * out loses nothing.
 */
export function AccountMenu({ initial }: { initial: string | null }): React.JSX.Element {
  const { t, i18n } = useTranslation('shell');
  const { t: menu } = useTranslation('menu');
  const { slug, viewer, roles, personName, staffPhone } = useShell();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const role = viewer.isOwner
    ? menu('roleOwner')
    : roles.length > 0
      ? roles.join(', ')
      : menu('staffOf');
  const item =
    'flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[15px] hover:bg-neutral-50';

  return (
    <span ref={box} className="relative inline-flex flex-none">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('yourMenu')}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex size-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-primary-text"
      >
        {initial ?? <Icon name="user" size={18} />}
      </button>
      {open ? (
        <span
          role="menu"
          aria-label={t('yourMenu')}
          className="absolute top-[calc(100%+8px)] right-0 z-30 flex w-[260px] flex-col rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(16,32,31,0.16)]"
        >
          <span className="mb-1 flex items-center gap-2.5 border-b border-line px-2.5 pt-2.5 pb-3">
            <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-brand-100 font-semibold text-primary-text">
              {initial ?? <Icon name="user" size={18} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="overflow-hidden text-[15px] text-ellipsis whitespace-nowrap">
                {personName ?? ''}
              </b>
              <small className="text-[13px] text-fg-muted">
                {[role, staffPhone].filter(Boolean).join(' · ')}
              </small>
            </span>
          </span>
          <Link
            role="menuitem"
            to="/$shop/account"
            params={{ shop: slug }}
            className={item}
            onClick={() => {
              setOpen(false);
            }}
          >
            <Icon name="user" size={18} />
            <span className="flex-1">{t('secAccount')}</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              void i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');
            }}
          >
            <Icon name="globe" size={18} />
            <span className="flex-1">{t('yourLanguage')}</span>
            <small className="text-[13px] text-fg-muted">
              {i18n.language === 'bn' ? 'বাংলা' : 'English'}
            </small>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={signOut.isPending}
            className={`${item} text-danger`}
            onClick={() => {
              signOut.mutate();
            }}
          >
            <Icon name="logout" size={18} />
            <span className="flex-1">{menu('signOut')}</span>
          </button>
        </span>
      ) : null}
    </span>
  );
}
