import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StockState } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { useCategories, useProductSearch } from '@/api/catalogue';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { RowList, RowText, RowTrail, rowClass } from '@/components/ui/list-row';
import { Eyebrow } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ProductSummary } from '@/types/catalogue';

// How long typing rests before the search runs.
const TYPING_REST_MS = 250;

const STOCK: Record<StockState, [StatusTone, string]> = {
  [StockState.In]: ['ok', 'inStock'],
  [StockState.Low]: ['warn', 'lowStock'],
  [StockState.Out]: ['bad', 'outStock'],
};

/** A product's price as a list shows it: one price, or its lowest and highest. */
function priceOf(product: ProductSummary): string {
  const low = product.minPrice ?? product.basePrice;
  const high = product.maxPrice;
  return high && high !== low
    ? `${formatTaka(low)}–${formatTaka(high).replace('৳', '')}`
    : formatTaka(low);
}

/**
 * TENANT-DASHBOARD-DESIGN §4.4, the prototype's `search-products`: one field and the matches grouped, with the same
 * rows the list uses. Until Phase 4 the only group is Products; orders and customers join it then.
 */
export function Search({ query }: { query: string }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug } = useShell();
  const navigate = useNavigate();
  const [typed, setTyped] = useState(query);
  const results = useProductSearch(query);
  const categories = useCategories();

  useEffect(() => {
    if (typed === query) return;
    const timer = window.setTimeout(() => {
      void navigate({
        to: '/$shop/search',
        params: { shop: slug },
        search: { q: typed },
        replace: true,
      });
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed, query, navigate, slug]);

  const categoryName = (id: string | null): string | null =>
    id === null
      ? t('uncategorized')
      : (categories.data?.find((each) => each.id === id)?.name ?? null);
  const products = results.data?.products ?? [];

  return (
    <ShellPage title={null}>
      <label className="flex h-11 items-center gap-2 rounded-[8px] border border-line-strong bg-surface px-3 text-[16px] text-fg-subtle focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus">
        <Icon name="search" />
        <input
          type="search"
          value={typed}
          autoFocus
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          placeholder={t('searchPh')}
          aria-label={t('search')}
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>
      {query.trim() === '' ? (
        <p className="text-[14px] text-fg-muted">{t('srchStart')}</p>
      ) : (
        <div>
          <Eyebrow>{t('srchProducts')}</Eyebrow>
          <Card flush className="mt-2">
            {results.isPending ? (
              <SkeletonRows count={2} />
            ) : products.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-fg-muted">
                {t('srchNone', { q: query.trim() })}
              </p>
            ) : (
              <RowList>
                {products.map((product) => {
                  const [tone, label] = STOCK[product.stockState];
                  const category = categoryName(product.primaryCategoryId);
                  return (
                    <Link
                      key={product.id}
                      to="/$shop/products"
                      params={{ shop: slug }}
                      className={rowClass}
                    >
                      <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-[8px] bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400">
                        {product.image ? (
                          <img
                            src={product.image.urls.thumbnail}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <Icon name="image" />
                        )}
                      </span>
                      <RowText
                        title={
                          <>
                            {product.name}{' '}
                            {product.active ? null : (
                              <StatusTag tone="neutral">{t('inactive')}</StatusTag>
                            )}
                          </>
                        }
                        sub={[
                          product.variantCount === 1
                            ? t('variant1')
                            : t('variantsN', { n: product.variantCount }),
                          category,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <RowTrail>
                        <span className="num text-[16px] font-semibold">{priceOf(product)}</span>
                        <StatusTag tone={tone}>{t(label)}</StatusTag>
                      </RowTrail>
                    </Link>
                  );
                })}
              </RowList>
            )}
          </Card>
        </div>
      )}
      <p className="text-[14px] text-fg-muted">{t('srchHint')}</p>
    </ShellPage>
  );
}
