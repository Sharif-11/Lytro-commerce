import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@lytronix/api-client';
import type { SerialFormat } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { ComboQuote, ProductDetail } from '@/types/product';
import type { comboQuoteBody, EditPart } from '@/lib/product-form';
import { withIdsFor } from '@/lib/photo-designs';
import { PRODUCTS_QUERY_KEY } from './catalogue';

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

/** POST /products/combo-quote (Slice 4.8c): what a combo's parts come to as the editor has them, saved or not. */
export function useComboQuote(body: ReturnType<typeof comboQuoteBody> | null) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'combo-quote', body],
    queryFn: () => tenantSession.client.post<ComboQuote>('/products/combo-quote', body),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    retry: false,
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

/**
 * What an edit's save came to: the product as the last saved part left it, each part refused with why, and the id each
 * new design took, by its key (PD-16).
 */
export interface EditOutcome {
  product: ProductDetail | null;
  refused: { part: EditPart['part']; error: unknown }[];
  designIds: Map<string, string>;
}

type ImagesPart = Extract<EditPart, { part: 'images' }>;
type VariantsPart = Extract<EditPart, { part: 'variants' }>;

/** The keys of the designs a photos save makes. */
const newKeys = (each: ImagesPart): Set<string> =>
  new Set(each.body.designs.filter((design) => !('id' in design)).map((design) => design.key));

/** PD-16: each new design's id, found by one of its photos in the product the photos save answered. */
function designIdsOf(each: ImagesPart, product: ProductDetail): Map<string, string> {
  const ids = new Map<string, string>();
  for (const key of newKeys(each)) {
    const photo = each.body.photos.find((one) => one.design === key)?.mediaId;
    const found = product.images.find((image) => image.id === photo)?.designId;
    if (found) ids.set(key, found);
  }
  return ids;
}

/** The variants as the server can take them: a new design named by its id, now the photos save made it. */
const withDesigns = (each: VariantsPart, ids: ReadonlyMap<string, string>): VariantsPart => ({
  part: 'variants',
  // The one-variant and the matrix shapes alike: only the options change.
  body: {
    ...each.body,
    variantAttributes: each.body.variantAttributes.map((entry) => ({
      ...entry,
      optionIds: withIdsFor(entry.optionIds, ids),
    })),
    variants: each.body.variants.map((row) => ({
      ...row,
      optionIds: withIdsFor(row.optionIds, ids),
    })),
  } as VariantsPart['body'],
});

const PART_PATH: Record<EditPart['part'], string> = {
  fields: '',
  variants: '/variants',
  attributes: '/attributes',
  zones: '/delivery-zones',
  chart: '/size-chart',
  images: '/images',
  video: '/video',
};

/** One part's own request: the fields by PATCH, the size chart put or taken off, every other part put. */
async function send(path: string, each: EditPart): Promise<ProductDetail | null> {
  if (each.part === 'fields') return tenantSession.client.patch<ProductDetail>(path, each.body);
  // PRD-17: the chart's own routes answer the chart, not the product.
  if (each.part === 'chart') {
    if (each.body === null) await tenantSession.client.delete<{ ok: true }>(path);
    else await tenantSession.client.put<unknown>(path, each.body);
    return null;
  }
  return tenantSession.client.put<ProductDetail>(path, each.body);
}

/**
 * Agreed for Slice 11.7a (point 7): one Save sends each changed part by its own request, in turn; a part refused
 * leaves the parts before and after it saved, and comes back named. PD-16: the photos go before the variants, which
 * then name each new design by the id it took; refused photos leave variants naming a new design unsent, for the
 * same reason.
 */
export function useSaveProduct(id: string) {
  const changed = useProductsChanged();
  return useMutation({
    mutationFn: async (parts: EditPart[]): Promise<EditOutcome> => {
      const outcome: EditOutcome = { product: null, refused: [], designIds: new Map() };
      let unsaved: { keys: Set<string>; error: unknown } | null = null;
      for (const part of parts) {
        let each = part;
        if (each.part === 'variants') {
          const named = each.body.variantAttributes.flatMap((entry) => entry.optionIds);
          if (unsaved && named.some((option) => unsaved?.keys.has(option))) {
            outcome.refused.push({ part: 'variants', error: unsaved.error });
            continue;
          }
          each = withDesigns(each, outcome.designIds);
        }
        const path = `/products/${id}${PART_PATH[each.part]}`;
        try {
          const answered = await send(path, each);
          outcome.product = answered ?? outcome.product;
          if (each.part === 'images' && answered) outcome.designIds = designIdsOf(each, answered);
        } catch (error) {
          outcome.refused.push({ part: each.part, error });
          if (each.part === 'images') unsaved = { keys: newKeys(each), error };
        }
      }
      return outcome;
    },
    onSettled: (outcome) => {
      changed(outcome?.product ?? undefined);
    },
  });
}

/**
 * POST /serials/check (INV-23, agreed for Slice 11.7c): which of the serials being entered a unit the shop holds
 * already has, as the server stores them, so each is flagged before saving.
 */
export function useCheckSerials() {
  return useMutation({
    mutationFn: (body: { serials: string[]; format: SerialFormat }) =>
      tenantSession.client.post<{ taken: string[] }>('/serials/check', body),
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
