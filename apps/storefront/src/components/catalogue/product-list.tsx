'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  type ProductCard as Card,
  type ProductPage,
  type ProductQuery,
  productQueryString,
} from '@/lib/api/storefront-api';
import { type ListParams, type ListSort, listHref } from '@/lib/catalogue/browse';
import { type Language, Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { ProductCard } from '../product-card';
import { Sheet } from '../product/sheets';

/** CCH-11: a list's grid and "Show more", which asks the storefront for the page after the last one shown (one counted
    call each) and adds it to the grid. Without a number of what is left: the server keeps no count of it. */
export function ProductList({
  language,
  products,
  nextCursor,
  query,
  now,
}: {
  language: Language;
  products: Card[];
  nextCursor: string | null;
  /** What the list asks for, without its cursor. */
  query: ProductQuery;
  now: number;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [shown, setShown] = useState(products);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const more = async () => {
    if (cursor === null || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/products?${productQueryString({ ...query, cursor })}`);
      if (!response.ok) return;
      const page = (await response.json()) as ProductPage;
      setShown((before) => [...before, ...page.products]);
      setCursor(page.nextCursor);
    } catch {
      // The button stays, to try again.
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <div className="grid">
        {shown.map((product) => (
          <ProductCard key={product.id} product={product} words={words} now={now} />
        ))}
      </div>
      {cursor !== null ? (
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            className="btn ghost"
            disabled={loading}
            onClick={() => {
              void more();
            }}
          >
            {words.t('load_more')}
          </button>
        </div>
      ) : null}
    </>
  );
}

const SORT_WORDS = {
  featured: 'sort_feat',
  newest: 'sort_new',
  price_low: 'sort_lo',
  price_high: 'sort_hi',
} as const satisfies Record<ListSort, string>;

/** PRD-09: the sort chip and its sheet (Featured, the shop's own order; newest; price either way). Picking one opens
    the page in that order, keeping its stock filter. */
export function SortChip({
  language,
  path,
  params,
  fallback,
}: {
  language: Language;
  path: string;
  params: ListParams;
  fallback: ListSort;
}) {
  const router = useRouter();
  const words = useMemo(() => new Words(language), [language]);
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="chip"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Icon name="sort" />
        {words.t('sort')}: {words.t(SORT_WORDS[params.sort])}
      </button>
      {open ? (
        <Sheet title={words.t('sort')} words={words} onClose={close}>
          <div className="slist" style={{ margin: '0 -16px' }}>
            {(Object.keys(SORT_WORDS) as ListSort[]).map((sort) => (
              <button
                type="button"
                key={sort}
                onClick={() => {
                  close();
                  router.push(listHref(path, { ...params, sort }, fallback));
                }}
              >
                <span>{words.t(SORT_WORDS[sort])}</span>
                {sort === params.sort ? (
                  <span className="c">
                    <Icon name="check" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
