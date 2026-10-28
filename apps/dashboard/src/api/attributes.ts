import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttributeDataType, UnitKind } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type {
  Attribute,
  AttributeOption,
  OptionSet,
  ProductDefaults,
  ProductStock,
} from '@/types/attribute';
import { PRODUCTS_QUERY_KEY } from './catalogue';

const ATTRIBUTES_QUERY_KEY = ['attributes'] as const;
const OPTION_SETS_QUERY_KEY = ['option-sets'] as const;

/** GET /attributes: the library's attributes and the shop's own, each with its options (ATL-01). */
export function useAttributes(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ATTRIBUTES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Attribute[]>('/attributes'),
    enabled: options.enabled ?? true,
  });
}

/** GET /option-sets: the sets inserted in one tap, the shop type's first, then the shop's own (ATR-16). */
export function useOptionSets(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: OPTION_SETS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<OptionSet[]>('/option-sets'),
    enabled: options.enabled ?? true,
  });
}

/**
 * GET /product-defaults?categoryId=: what a new product starts with, from its primary category's type or the shop's
 * (PST-02, PST-06), with the category's suggested attributes first.
 */
export function useProductDefaults(categoryId: string | null) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'defaults', categoryId ?? ''],
    queryFn: () =>
      tenantSession.client.get<ProductDefaults>(
        `/product-defaults${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
}

/** GET /products/:id/stock: what each variant holds and can sell (INV-01), for someone who may see stock. */
export function useProductStock(productId: string | null, options: { enabled: boolean }) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'stock', productId ?? ''],
    queryFn: () => tenantSession.client.get<ProductStock>(`/products/${productId ?? ''}/stock`),
    enabled: options.enabled && productId !== null,
  });
}

/** The library read again, after anything adds to it. */
function useAttributesChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ATTRIBUTES_QUERY_KEY });
  };
}

/** POST /attributes: one of the shop's own, made the moment it is named on a product (ATR-01). */
export function useCreateAttribute() {
  const changed = useAttributesChanged();
  return useMutation({
    mutationFn: (body: { name: string; dataType: AttributeDataType; unitKind?: UnitKind }) =>
      tenantSession.client.post<Attribute>('/attributes', body),
    onSuccess: changed,
  });
}

/**
 * POST /attributes/:id/options/batch: values added at once, typed or from a set (ATR-16); a value the shop already sees
 * comes back as it is rather than doubled.
 */
export function useAddOptions() {
  const changed = useAttributesChanged();
  return useMutation({
    mutationFn: ({ attributeId, values }: { attributeId: string; values: string[] }) =>
      tenantSession.client.post<AttributeOption[]>(`/attributes/${attributeId}/options/batch`, {
        values,
      }),
    onSuccess: changed,
  });
}

/** PATCH /attributes/:id/options/:optionId: a swatch on one of the shop's own values (ATR-18); setting one clears the other. */
export function useSetSwatch() {
  const changed = useAttributesChanged();
  return useMutation({
    mutationFn: ({
      attributeId,
      optionId,
      swatch,
    }: {
      attributeId: string;
      optionId: string;
      swatch: { swatchColor: string | null } | { swatchImageId: string | null };
    }) =>
      tenantSession.client.patch<AttributeOption>(
        `/attributes/${attributeId}/options/${optionId}`,
        swatch,
      ),
    onSuccess: changed,
  });
}

/** POST /option-sets: the shop's own set, from an attribute's values, for the next product (ATR-16). */
export function useSaveOptionSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; options: string[] }) =>
      tenantSession.client.post<OptionSet>('/option-sets', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPTION_SETS_QUERY_KEY });
    },
  });
}
