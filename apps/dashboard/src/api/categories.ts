import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { CategorySummary, ProductPage } from '@/types/catalogue';
import { CATEGORIES_QUERY_KEY, PRODUCTS_QUERY_KEY } from './catalogue';

/** What a category's sheet sends: its own fields, as `createCategorySchema` takes them. */
export interface CategoryFields {
  name: string;
  parentId: string | null;
  visible: boolean;
  behavesLike: string | null;
}

/** A new category's fields before anything is typed: at the top, shown on the storefront, following the shop's type. */
export const NO_CATEGORY: CategoryFields = {
  name: '',
  parentId: null,
  visible: true,
  behavesLike: null,
};

/** A category's chart as saved (PRD-17): a table, or a picture of the shop's. */
export type CategoryChart = { rows: string[][] } | { imageId: string };

/** GET /products?categoryId=uncategorized: how many products are filed in no category (PRD-03's "Uncategorized"). */
export function useUncategorizedCount(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'uncategorized'],
    queryFn: () =>
      tenantSession.client.get<ProductPage>('/products?categoryId=uncategorized&limit=1'),
    select: (page) => page.counts.total,
    enabled: options.enabled ?? true,
  });
}

/** The tree read again after any change; a delete also moves products, so their lists too. */
function useCategoriesChanged(): (products?: boolean) => void {
  const queryClient = useQueryClient();
  return (products = false) => {
    void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    if (products) void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** POST /categories: a category, from the Categories page or the editor's picker (PRD-03, §7.5). */
export function useCreateCategory() {
  const changed = useCategoriesChanged();
  return useMutation({
    mutationFn: (body: CategoryFields) =>
      tenantSession.client.post<CategorySummary>('/categories', body),
    onSuccess: () => {
      changed();
    },
  });
}

/** PATCH /categories/:id: renamed, moved with everything under it, reordered, shown or hidden (PRD-03, PST-06). */
export function useUpdateCategory() {
  const changed = useCategoriesChanged();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CategoryFields> }) =>
      tenantSession.client.patch<CategorySummary>(`/categories/${id}`, body),
    onSuccess: () => {
      changed();
    },
  });
}

/**
 * Move up or Move down (§7.5's ⋯ menu): the siblings numbered in their new order, each whose place changed saved. The
 * server sorts a level by its numbers, then by name, so a level never numbered before is numbered whole.
 */
export function useReorderCategories() {
  const changed = useCategoriesChanged();
  return useMutation({
    mutationFn: async (order: readonly CategorySummary[]) => {
      for (const [index, category] of order.entries()) {
        if (category.sortOrder === index) continue;
        await tenantSession.client.patch<CategorySummary>(`/categories/${category.id}`, {
          sortOrder: index,
        });
      }
    },
    onSettled: () => {
      changed();
    },
  });
}

/**
 * DELETE /categories/:id (PRD-03): refused while it has sub-categories; one holding products is deleted only when they
 * are moved to Uncategorized.
 */
export function useDeleteCategory() {
  const changed = useCategoriesChanged();
  return useMutation({
    mutationFn: ({ id, uncategorize }: { id: string; uncategorize: boolean }) =>
      tenantSession.client.delete<{ ok: true }>(
        `/categories/${id}${uncategorize ? '?products=uncategorize' : ''}`,
      ),
    onSuccess: () => {
      changed(true);
    },
  });
}

/** PUT /categories/:id/attributes (ATR-02): the attributes suggested for its new products, in order. */
export function useSetCategorySuggestions() {
  const changed = useCategoriesChanged();
  return useMutation({
    mutationFn: ({ id, attributeIds }: { id: string; attributeIds: string[] }) =>
      tenantSession.client.put<CategorySummary>(`/categories/${id}/attributes`, { attributeIds }),
    onSuccess: () => {
      changed();
    },
  });
}

/** PUT or DELETE /categories/:id/size-chart (PRD-17): its chart, shown on its products without their own; or none. */
export function useSetCategoryChart() {
  const changed = useCategoriesChanged();
  return useMutation({
    mutationFn: ({ id, chart }: { id: string; chart: CategoryChart | null }) =>
      chart === null
        ? tenantSession.client.delete<{ ok: true }>(`/categories/${id}/size-chart`)
        : tenantSession.client.put<unknown>(`/categories/${id}/size-chart`, chart),
    onSuccess: () => {
      changed();
    },
  });
}
