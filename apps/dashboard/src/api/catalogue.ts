import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { CategorySummary, ProductPage } from '@/types/catalogue';
import { segmentQuery, type ProductSegment } from '@/lib/product-segments';

export const PRODUCTS_QUERY_KEY = ['products'] as const;
export const CATEGORIES_QUERY_KEY = ['categories'] as const;

/** GET /products?search=: the products a search names (PRD-12, TENANT-DASHBOARD-DESIGN §4.4), 20 at most. */
export function useProductSearch(query: string, options: { enabled?: boolean } = {}) {
  const search = query.trim();
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'search', search],
    queryFn: () =>
      tenantSession.client.get<ProductPage>(
        `/products?${new URLSearchParams({ search, limit: '20' }).toString()}`,
      ),
    enabled: (options.enabled ?? true) && search.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** What the Products page shows: a search, a segment and a category (or products filed in none). */
export interface ProductFilter {
  search: string;
  segment: ProductSegment;
  categoryId: string | null;
}

/**
 * GET /products for the Products page (PRD-12): 20 a page, Show more for the next, each page with the segments' counts
 * and the shop's product limit.
 */
export function useProductList(filter: ProductFilter) {
  const search = filter.search.trim();
  return useInfiniteQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'list', search, filter.segment, filter.categoryId],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<ProductPage>(
        `/products?${new URLSearchParams({
          ...(search ? { search } : {}),
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
          ...segmentQuery(filter.segment),
          page: String(pageParam),
        }).toString()}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** PRD-04: how many products the shop has against its limit, and whether one more fits. */
export interface ProductRoom {
  used: number;
  limit: number | null;
  full: boolean;
}

/**
 * PRD-04: the room for one more product, from one unfiltered row of the list -- its count is every product not archived,
 * where a searched or filtered page counts only what it picks.
 */
export function useProductRoom() {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'room'],
    queryFn: () => tenantSession.client.get<ProductPage>('/products?limit=1'),
    select: (page): ProductRoom => ({
      used: page.counts.total,
      limit: page.productLimit,
      full: page.productLimit !== null && page.counts.total >= page.productLimit,
    }),
  });
}

/** GET /categories: the shop's category tree, top level first (ATR-07). */
export function useCategories(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<CategorySummary[]>('/categories'),
    enabled: options.enabled ?? true,
  });
}
