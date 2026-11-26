'use client';

import type { ProductCardStyle } from '@lytronix/validators/common';
import { useMemo, useRef, useState } from 'react';
import {
  isBusyStatus,
  type ProductCard,
  type ProductPage,
  type ProductQuery,
  productQueryString,
} from '@/lib/api/storefront-api';
import { cardKey } from '@/lib/design/card-links';
import type { AllProducts } from '@/lib/design/home-reads';
import { type Language, Words } from '@/lib/i18n/words';
import { DesignIcon } from './design-icon';
import { ThemeCard } from './theme-card';

/**
 * STOREFRONT-BUILDER-PLAN SB-32: "সব প্রোডাক্ট"'s grid and its button. "আরও দেখুন" adds the next twelve in place: first
 * what the home's own read held past its first page, then the list read on from where it stopped (one counted call
 * each, as a category page's "Show more"), skipping every card already on the page. The button says how many products
 * the page has not shown yet, and goes once the list ends.
 */
export function AllProductsGrid({
  language,
  style,
  now,
  all,
  pageSize,
  productCount,
  query,
}: {
  language: Language;
  style: ProductCardStyle;
  now: number;
  all: AllProducts;
  /** STOREFRONT_ALL_PRODUCTS_PAGE, from the page (this client bundle reads no validators). */
  pageSize: number;
  /** The shop's active products; undefined from an older server, when the button says no number. */
  productCount: number | undefined;
  /** What the list asks for, without its cursor. */
  query: ProductQuery;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [cards, setCards] = useState(all.shown);
  const [queued, setQueued] = useState(all.queued);
  const [cursor, setCursor] = useState(all.cursor);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const known = useRef(new Set(all.seen));
  const more = async () => {
    if (loading) return;
    setLoading(true);
    let take = queued.slice(0, pageSize);
    let left = queued.slice(pageSize);
    let at = cursor;
    try {
      while (take.length < pageSize && at !== null) {
        const response = await fetch(
          `/api/products?${productQueryString({ ...query, cursor: at })}`,
        );
        setBusy(isBusyStatus(response.status));
        if (!response.ok) break;
        const page = (await response.json()) as ProductPage;
        const fresh = page.products.filter((card) => !known.current.has(cardKey(card)));
        for (const card of fresh) known.current.add(cardKey(card));
        const room = pageSize - take.length;
        take = [...take, ...fresh.slice(0, room)];
        left = [...left, ...fresh.slice(room)];
        at = page.nextCursor;
      }
    } catch {
      // The button stays, to try again from where the list stopped.
    } finally {
      setCards((before) => [...before, ...take]);
      setQueued(left);
      setCursor(at);
      setLoading(false);
    }
  };
  const ask = () => {
    void more();
  };
  const onPage = new Set([...all.above, ...cards.map((card: ProductCard) => card.id)]);
  const unseen = productCount === undefined ? 0 : productCount - onPage.size;
  const goesOn = queued.length > 0 || cursor !== null;
  let after = null;
  if (goesOn && busy) {
    after = (
      <div className="sb-more-busy">
        <span className="busy-line">{words.t('p910DelivBusy')}</span> ·{' '}
        <button type="button" className="lnk" disabled={loading} onClick={ask}>
          {words.t('p910DelivAgain')}
        </button>
      </div>
    );
  } else if (goesOn) {
    after = (
      <button type="button" className="sb-more" disabled={loading} onClick={ask}>
        {unseen > 0 ? words.t('sb_more_n', { n: unseen }) : words.t('sb_more')}
        <DesignIcon name="down" />
      </button>
    );
  }
  return (
    <>
      <div className="sb-grid">
        {cards.map((card) => (
          <ThemeCard key={cardKey(card)} product={card} style={style} words={words} now={now} />
        ))}
      </div>
      {after}
    </>
  );
}
