import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@lytronix/api-client';
import { tenantSession } from '@/session/tenant-session';
import type { CategorySummary } from '@/types/catalogue';
import type { ProductDetail } from '@/types/product';
import type { EditPart } from '@/lib/product-form';
import { CATEGORIES_QUERY_KEY, PRODUCTS_QUERY_KEY } from './catalogue';

const productKey = (id: string) => [...PRODUCTS_QUERY_KEY, 'detail', id] as const;

/** GET /products/:id: everything the editor shows (TENANT-DASHBOARD-DESIGN §7.4). */
export function useProduct(id: string | null) {
  return useQuery({
    queryKey: productKey(id ?? ''),
    queryFn: () => tenantSession.client.get<ProductDetail>(`/products/${id ?? ''}`),
    enabled: id !== null,
    // A product that is not there will not be there on asking again.
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.code === 'not_found') && count < 3,
  });
}

/** After any write: the lists, the room for one more, and this product read again. */
function useProductsChanged(): (product?: ProductDetail) => void {
  const queryClient = useQueryClient();
  return (product) => {
    if (product) queryClient.setQueryData(productKey(product.id), product);
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** POST /products: a new product with its photos and video, in one request (PRD-01, agreed point 7). */
export function useCreateProduct() {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: (body: unknown) => tenantSession.client.post<ProductDetail>('/products', body),
    onSuccess: changed,
  });
}

/** What an edit's save came to: the product as the last saved part left it, and each part refused with why. */
export interface EditOutcome {
  product: ProductDetail | null;
  refused: { part: EditPart['part']; error: unknown }[];
}

const PART_PATH: Record<EditPart['part'], string> = {
  fields: '',
  images: '/images',
  video: '/video',
};

/**
 * Agreed for Slice 11.7a (point 7): one Save sends each changed part by its own request, in turn; a part refused
 * leaves the parts before and after it saved, and comes back named.
 */
export function useSaveProduct(id: string) {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: async (parts: EditPart[]): Promise<EditOutcome> => {
      const outcome: EditOutcome = { product: null, refused: [] };
      for (const each of parts) {
        const path = `/products/${id}${PART_PATH[each.part]}`;
        try {
          outcome.product =
            each.part === 'fields'
              ? await tenantSession.client.patch<ProductDetail>(path, each.body)
              : await tenantSession.client.put<ProductDetail>(path, each.body);
        } catch (error) {
          outcome.refused.push({ part: each.part, error });
        }
      }
      return outcome;
    },
    onSettled: (outcome) => {
      changed(outcome?.product ?? undefined);
    },
  });
}

/** PUT /products/:id/slug: a deliberate link change; the old link keeps redirecting (LND-04). */
export function useChangeSlug(id: string) {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: (slug: string) =>
      tenantSession.client.put<ProductDetail>(`/products/${id}/slug`, { slug }),
    onSuccess: changed,
  });
}

/** POST /products/:id/duplicate: an inactive copy with a new link (PRD-18). */
export function useDuplicateProduct(id: string) {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: () => tenantSession.client.post<ProductDetail>(`/products/${id}/duplicate`),
    onSuccess: changed,
  });
}

/** DELETE /products/:id: archived, or deleted for good with `hard` (PRD-13). */
export function useRemoveProduct(id: string) {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: (hard: boolean) =>
      tenantSession.client.delete<{ ok: true }>(`/products/${id}${hard ? '?hard=true' : ''}`),
    onSuccess: () => {
      changed();
    },
  });
}

/** POST /products/:id/restore: an archived product back in the list (PRD-13, agreed 2026-10-27). */
export function useRestoreProduct(id: string) {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: () => tenantSession.client.post<ProductDetail>(`/products/${id}/restore`),
    onSuccess: changed,
  });
}

/** POST /categories: a category made from the editor's picker (§7.5's "From the product editor"). */
export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      parentId: string | null;
      visible: boolean;
      behavesLike: string | null;
    }) => tenantSession.client.post<CategorySummary>('/categories', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}
