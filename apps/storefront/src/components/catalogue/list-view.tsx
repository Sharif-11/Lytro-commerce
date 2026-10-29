import type { ReactNode } from 'react';
import { type ProductPage, type ProductQuery, productQueryString } from '@/lib/api/storefront-api';
import { type ListParams, type ListSort, listHref } from '@/lib/catalogue/browse';
import type { Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { ProductList, SortChip } from './product-list';

/** STOREFRONT-DESIGN §3: a category's or New arrivals' page body as the prototype's categoryPage draws it -- the
    heading, the chips, the sort chip (where the page offers orders) and "In stock only", then the grid. */
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
}) {
  return (
    <>
      {heading}
      {chips}
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}
      >
        {sortable ? (
          <SortChip language={words.language} path={path} params={params} fallback={fallback} />
        ) : (
          <span />
        )}
        <a
          className={params.inStock ? 'chip on' : 'chip'}
          href={listHref(path, { ...params, inStock: !params.inStock }, fallback)}
        >
          <Icon name="check" />
          {words.t('instock_only')}
        </a>
      </div>
      {page.products.length > 0 ? (
        <ProductList
          // A new order or filter is a new list: what "Show more" added to the old one goes with it.
          key={productQueryString(query)}
          language={words.language}
          products={page.products}
          nextCursor={page.nextCursor}
          query={query}
          now={Date.now()}
        />
      ) : (
        <p className="sub">{words.t('no_results')}</p>
      )}
    </>
  );
}
