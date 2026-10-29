import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { useShell } from './shell-context';

/** The first letter of a name as a reader sees it -- a Bangla letter with its vowel sign (রু), a Latin capital. */
function initialOf(name: string | null): string | null {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const { segment } of graphemes.segment((name ?? '').trim())) {
    return segment.toLocaleUpperCase('en');
  }
  return null;
}

interface DeskHeaderProps {
  canSearch: boolean;
  canAdd: boolean;
}

/**
 * TENANT-DASHBOARD-DESIGN §4.3, the prototype's `.header`: from 1024 px, 64 px -- the page's title on the left;
 * search (320 px), +, the language and the person's initial on the right (the bell joins in Phase 7).
 */
export function DeskHeader({ canSearch, canAdd }: DeskHeaderProps): React.JSX.Element {
  const { t, i18n } = useTranslation('shell');
  const { slug, tenant, screen, personName, openPlus, recordTitle } = useShell();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const initial = initialOf(personName);
  return (
    <header className="hidden h-16 flex-none items-center gap-3 border-b border-line bg-surface px-8 lg:flex">
      <h1 className="min-w-0 flex-1 overflow-hidden text-[20px] font-bold text-ellipsis whitespace-nowrap">
        {recordTitle ??
          (screen?.deskTitle
            ? t(screen.deskTitle)
            : screen?.title
              ? t(screen.title)
              : tenant.shopName)}
      </h1>
      {canSearch ? (
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({ to: '/$shop/search', params: { shop: slug }, search: { q: query } });
          }}
          className="flex h-10 w-80 flex-none items-center gap-2 rounded-button border border-line-strong bg-surface px-3 text-[14px] text-fg-subtle focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus"
        >
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={t('searchPh')}
            aria-label={t('search')}
            className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:appearance-none"
          />
        </form>
      ) : null}
      {canAdd ? (
        <button
          type="button"
          aria-label={t('plusTitle')}
          onClick={openPlus}
          className="relative inline-flex size-10 items-center justify-center rounded-button border border-line text-fg-muted"
        >
          <Icon name="plus" />
        </button>
      ) : null}
      <button
        type="button"
        lang={i18n.language === 'bn' ? 'en' : 'bn'}
        aria-label={t('langToggleLabel')}
        onClick={() => {
          void i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');
        }}
        className="h-10 rounded-button border border-line px-2.5 text-[13px] font-semibold text-fg-muted"
      >
        {t('langToggle')}
      </button>
      <span
        title={personName ?? undefined}
        aria-hidden="true"
        className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-brand-100 font-semibold text-primary-text"
      >
        {initial ?? <Icon name="user" size={18} />}
      </span>
    </header>
  );
}
