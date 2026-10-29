'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { PublicCategory } from '@/lib/api/storefront-api';
import { type Language, Words } from '@/lib/i18n/words';
import { browserRecentSearches } from '@/lib/search/recent-searches';
import { Icon } from '../icon';
import { InShell } from '../in-shell';

// CCH-12, Slice 12b's read: search asks the server only when the shopper submits, never as they type, since each search
// is a counted call. Before that the panel offers this device's recent searches and the shop's categories with their
// counts as a way in. The prototype's search overlay (searchOverlay); the /search page shows its results in the same
// panel.

const SUGGESTIONS = 5;

export interface SearchPanelProps {
  language: Language;
  /** The shop's top-level categories, for the suggestions. */
  categories: PublicCategory[];
  query?: string;
  /** The results the /search page found for `query`; none while typing a new one. */
  results?: ReactNode;
  /** Leaves the panel: the overlay closes, the page goes home. */
  onCancel?: () => void;
}

export function SearchPanel(props: SearchPanelProps) {
  const router = useRouter();
  const words = useMemo(() => new Words(props.language), [props.language]);
  const [query, setQuery] = useState(props.query ?? '');
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setRecent(browserRecentSearches().list());
  }, []);
  const go = (search: string) => {
    const text = search.replace(/\s+/gu, ' ').trim();
    if (text === '') return;
    setQuery(text);
    browserRecentSearches().remember(text);
    router.push(`/search?q=${encodeURIComponent(text)}`);
  };
  const typing = query.trim() !== (props.query ?? '').trim() || props.results === undefined;
  const suggestions = props.categories.filter((category) => category.productCount > 0);
  const cancel = (
    <button
      type="button"
      className="btn quiet sm"
      onClick={() => {
        if (props.onCancel) props.onCancel();
        else router.push('/');
      }}
    >
      {words.t('cancel')}
    </button>
  );

  return (
    <div className="sover">
      <div className="sbar">
        <form
          className="sbox"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            go(query);
          }}
        >
          <Icon name="search" />
          <input
            value={query}
            placeholder={words.t('search_ph')}
            aria-label={words.t('search_ph')}
            enterKeyHint="search"
            autoFocus={props.results === undefined}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {query !== '' ? (
            <button
              type="button"
              aria-label={words.t('close')}
              onClick={() => {
                setQuery('');
              }}
            >
              <Icon name="x" />
            </button>
          ) : null}
        </form>
        {cancel}
      </div>
      <div className="spanel">
        {typing ? (
          <div className="slist">
            {recent.length > 0 ? (
              <div style={{ padding: '12px 16px 4px' }} className="eyebrow">
                {words.t('recent')}
              </div>
            ) : null}
            {recent.map((search) => (
              <button
                type="button"
                key={search}
                onClick={() => {
                  go(search);
                }}
              >
                <Icon name="history" />
                <span>{search}</span>
              </button>
            ))}
            {suggestions.length > 0 ? (
              <div style={{ padding: '12px 16px 4px' }} className="eyebrow">
                {words.t('suggestions')}
              </div>
            ) : null}
            {suggestions.slice(0, SUGGESTIONS).map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => {
                  router.push(`/c/${category.slug}`);
                }}
              >
                <Icon name="chev" />
                <span>{category.name}</span>
                <span className="c">{category.productCount}</span>
              </button>
            ))}
          </div>
        ) : (
          props.results
        )}
      </div>
    </div>
  );
}

/** The header's ways into search: the box on a wide screen, the icon on a phone; either opens the overlay. */
export function SearchTools({
  language,
  categories,
  phoneButton,
}: {
  language: Language;
  categories: PublicCategory[];
  phoneButton: boolean;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const show = () => {
    setOpen(true);
  };
  return (
    <>
      <div className="dsearch">
        <div
          className="sbox q"
          role="button"
          tabIndex={0}
          onClick={show}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') show();
          }}
        >
          <Icon name="search" />
          <span>{words.t('search_ph')}</span>
        </div>
      </div>
      {phoneButton ? (
        <button
          type="button"
          className="ib msearch"
          aria-label={words.t('search_ph')}
          onClick={show}
        >
          <Icon name="search" />
        </button>
      ) : null}
      {open ? (
        <InShell>
          <SearchPanel
            language={language}
            categories={categories}
            onCancel={() => {
              setOpen(false);
            }}
          />
        </InShell>
      ) : null}
    </>
  );
}
