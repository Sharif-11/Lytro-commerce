import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { CategorySummary, ProductPage } from '@/types/catalogue';

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

/** GET /categories: the shop's category tree, top level first (ATR-07). */
export function useCategories(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<CategorySummary[]>('/categories'),
    enabled: options.enabled ?? true,
  });
}
