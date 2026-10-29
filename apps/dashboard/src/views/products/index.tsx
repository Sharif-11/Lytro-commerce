import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import { useCategories, useProductList, useProductRoom } from '@/api/catalogue';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import {
  PRODUCT_SEGMENTS,
  SEGMENT_LABEL,
  segmentCount,
  type ProductSegment,
} from '@/lib/product-segments';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { CategoryFilterSheet, UNCATEGORIZED } from './category-filter-sheet';
import { ProductLimitBanner } from './product-limit-banner';
import { ProductRow } from './product-row';
import { useCategoryName } from './product-words';

// How long typing rests before the list asks the server.
const TYPING_REST_MS = 250;

interface ProductsViewProps {
  search: string;
  segment: ProductSegment;
  /** A category's id, UNCATEGORIZED, or null for all. */
  categoryId: string | null;
  /** Add product was asked for at the limit (Part 13's `products-limit-now`). */
  limitAsked: boolean;
}

/**
 * Products (TENANT-DASHBOARD-DESIGN §7.3, the prototype's `products` and Part 13's states): the search and the category
 * filter, the segments counted by the server, the rows, Show more past 20; empty for a new shop with the trial's
 * limit; nothing matching with Show all; and Add product, which at the limit says so before anything is typed.
 */
export function ProductsView({
  search,
  segment,
  categoryId,
  limitAsked,
}: ProductsViewProps): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer, tenant } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const [typed, setTyped] = useState(search);
  const [filtering, setFiltering] = useState(false);
  const list = useProductList({ search, segment, categoryId });
  const room = useProductRoom();
  const categories = useCategories();
  const categoryName = useCategoryName();

  function show(next: { q?: string; seg?: ProductSegment; cat?: string | null }): void {
    const q = next.q ?? search;
    const seg = next.seg ?? segment;
    const cat = next.cat === undefined ? categoryId : next.cat;
    void navigate({
      to: '/$shop/products',
      params: { shop: slug },
      search: {
        q: q.trim() ? q : undefined,
        seg: seg === 'all' ? undefined : seg,
        cat: cat ?? undefined,
      },
      replace: true,
    });
  }

  useEffect(() => {
    if (typed === search) return;
    const timer = window.setTimeout(() => {
      show({ q: typed });
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const pages = list.data?.pages ?? [];
  const first = pages[0];
  const products = pages.flatMap((page) => page.products);
  const filtered = search.trim() !== '' || categoryId !== null || segment !== 'all';
  const newShop =
    first !== undefined && !filtered && first.counts.total === 0 && first.counts.archived === 0;
  const chosenName =
    categoryId === UNCATEGORIZED
      ? t('uncategorized')
      : (categories.data?.find((each) => each.id === categoryId)?.name ?? '');

  // The header's carries the plus; the empty state's does not (the prototype's `products`).
  const addProduct = (withIcon: boolean) =>
    mayManage ? (
      <Link
        to="/$shop/products/new"
        params={{ shop: slug }}
        className={buttonClass('primary', 'sm')}
        onClick={(event) => {
          // PRD-04 (agreed 2026-10-27): at the limit, say so before anything is typed.
          if (!room.data?.full) return;
          event.preventDefault();
          void navigate({
            to: '/$shop/products',
            params: { shop: slug },
            search: (previous) => ({ ...previous, limit: true }),
            replace: true,
          });
        }}
      >
        {withIcon ? <Icon name="plus" /> : null}
        {t('addProduct')}
      </Link>
    ) : null;

  return (
    <ShellPage actions={addProduct(true)}>
      {limitAsked && room.data?.full ? <ProductLimitBanner room={room.data} /> : null}
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {newShop ? (
        <Card>
          <EmptyState icon="tag" action={addProduct(false)}>
            {t('noProducts')}
            {tenant.state === TenantState.Trial && first.productLimit !== null
              ? ` ${t('trialLimit', { limit: first.productLimit })}`
              : ''}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <SearchField
              value={typed}
              onChange={setTyped}
              placeholder={t('productName')}
              label={t('searchProducts')}
            />
            <button
              type="button"
              aria-label={t('plFilterTitle')}
              aria-pressed={categoryId !== null}
              onClick={() => {
                setFiltering(true);
              }}
              className="flex size-11 flex-none items-center justify-center rounded-button border border-line-strong bg-surface text-neutral-700 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary"
            >
              <Icon name="filter" />
            </button>
          </div>
          {categoryId !== null ? (
            <div className="flex">
              <Chip
                on
                aria-label={t('clearCategory', { category: chosenName })}
                onClick={() => {
                  show({ cat: null });
                }}
              >
                {chosenName}
                <Icon name="x" size={14} />
              </Chip>
            </div>
          ) : null}
          <ChipRow role="group">
            {PRODUCT_SEGMENTS.filter(
              (each) =>
                each !== 'archived' || segment === 'archived' || (first?.counts.archived ?? 0) > 0,
            ).map((each) => (
              <Chip
                key={each}
                on={segment === each}
                count={first ? segmentCount(each, first.counts) : null}
                onClick={() => {
                  show({ seg: each });
                }}
              >
                {t(SEGMENT_LABEL[each])}
              </Chip>
            ))}
          </ChipRow>
          {list.isPending ? (
            <Card flush>
              <SkeletonRows count={4} />
            </Card>
          ) : products.length === 0 && list.isSuccess ? (
            <Card>
              <EmptyState
                icon="search"
                action={
                  <Button
                    tone="outline"
                    size="sm"
                    onClick={() => {
                      setTyped('');
                      show({ q: '', seg: 'all', cat: null });
                    }}
                  >
                    {t('plShowAll')}
                  </Button>
                }
              >
                {t('plNone')}
              </EmptyState>
            </Card>
          ) : products.length > 0 ? (
            <Card flush>
              <RowList>
                {products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    category={categoryName(product.primaryCategoryId)}
                    archived={segment === 'archived'}
                  />
                ))}
              </RowList>
            </Card>
          ) : null}
          {list.hasNextPage && first ? (
            <div className="flex flex-col gap-2">
              <Button
                tone="outline"
                wide
                busy={list.isFetchingNextPage}
                onClick={() => {
                  void list.fetchNextPage();
                }}
              >
                {t('plMore')}
              </Button>
              <p className="text-center text-[14px] text-fg-muted">
                {t('plShown', { shown: products.length, total: first.total })}
              </p>
            </div>
          ) : null}
        </>
      )}
      <CategoryFilterSheet
        open={filtering}
        chosen={categoryId}
        onChoose={(chosen) => {
          setFiltering(false);
          show({ cat: chosen });
        }}
        onClose={() => {
          setFiltering(false);
        }}
      />
    </ShellPage>
  );
}
