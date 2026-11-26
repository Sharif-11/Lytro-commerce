import type { ReactNode } from 'react';
import type { ListTheme } from '@/lib/design/list-theme';
import { type ProductPage, type ProductQuery, productQueryString } from '@/lib/api/storefront-api';
import { type ListParams, type ListSort, listHref } from '@/lib/catalogue/browse';
import type { Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { ProductList, SortChip } from './product-list';

/** STOREFRONT-DESIGN §3: a category's or New arrivals' page body as the prototype's categoryPage draws it -- the
    heading with "In stock only" on its line (the owner, 2026-11-19), the chips, the sort chip where the page offers
    orders, then the grid. */
export function ListView({
  words,
  heading,
  chips,
  path,
  params,
  fallback,
  sortable,
  page,
  query,
  theme,
  empty,
}: {
  words: Words;
  heading: ReactNode;
  chips: ReactNode;
  path: string;
  params: ListParams;
  fallback: ListSort;
  sortable: boolean;
  page: ProductPage;
  query: ProductQuery;
  /** STOREFRONT-BUILDER-PLAN SB-17: a designed shop's card and look; null, the storefront's own. */
  theme?: ListTheme | null;
  /**
   * SB-33: what the page shows in place of an empty list (`EmptyList`). The stock switch stays only while it is what
   * emptied the list; the chips, the sort and the "Nothing found" line go.
   */
  empty?: ReactNode;
}) {
  const none = page.products.length === 0 && empty !== undefined && empty !== null;
  return (
    <>
      <div
        className="list-head"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {heading}
        {none && !params.inStock ? null : (
          <a
            className={params.inStock ? 'chip on' : 'chip'}
            href={listHref(path, { ...params, inStock: !params.inStock }, fallback)}
          >
            <Icon name="check" />
            {words.t('instock_only')}
          </a>
        )}
      </div>
      {none ? null : chips}
      {sortable && !none ? (
        <div style={{ display: 'flex' }}>
          <SortChip language={words.language} path={path} params={params} fallback={fallback} />
        </div>
      ) : null}
      {page.products.length > 0 ? (
        <ProductList
          // A new order or filter is a new list: what "Show more" added to the old one goes with it.
          key={productQueryString(query)}
          language={words.language}
          products={page.products}
          nextCursor={page.nextCursor}
          query={query}
          now={Date.now()}
          theme={theme}
        />
      ) : none ? (
        empty
      ) : (
        <p className="sub">{words.t('no_results')}</p>
      )}
    </>
  );
}
