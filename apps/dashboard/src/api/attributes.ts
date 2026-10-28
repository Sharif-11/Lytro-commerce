import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AttributeDataType, UnitKind } from '@lytronix/validators';
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

/**
 * GET /attributes: the library's attributes and the shop's own, each with its options (ATL-01); with the retired ones
 * and their retired options when asked, as the Attributes page lists them (ATR-10).
 */
export function useAttributes(options: { enabled?: boolean; includeRetired?: boolean } = {}) {
  const retired = options.includeRetired ?? false;
  return useQuery({
    queryKey: [...ATTRIBUTES_QUERY_KEY, retired ? 'all' : 'live'],
    queryFn: () =>
      tenantSession.client.get<Attribute[]>(`/attributes${retired ? '?includeRetired=true' : ''}`),
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
export function useProductDefaults(categoryId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'defaults', categoryId ?? ''],
    queryFn: () =>
      tenantSession.client.get<ProductDefaults>(
        `/product-defaults${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
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

/** A new attribute as typed (Part 14's New attribute step): its name, its type, and what a number measures. */
export interface AttributeDraft {
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
}

/**
 * POST /attributes: one of the shop's own, made the moment it is named on a product or from the Attributes page
 * (ATR-01); only a number names what it measures (UOM-02), a weight unless chosen.
 */
export function useCreateAttribute() {
  const changed = useAttributesChanged();
  return useMutation({
    mutationFn: (draft: AttributeDraft) =>
      tenantSession.client.post<Attribute>('/attributes', {
        name: draft.name.trim(),
        dataType: draft.dataType,
        ...(draft.dataType === AttributeDataType.NumberWithUnit
          ? { unitKind: draft.unitKind ?? UnitKind.Weight }
          : {}),
      }),
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

/** PATCH /attributes/:id (ATR-10): the shop's own attribute renamed, retired, or brought back. */
export function useUpdateAttribute() {
  const changed = useAttributesChanged();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; retired?: boolean } }) =>
      tenantSession.client.patch<Attribute>(`/attributes/${id}`, body),
    onSuccess: changed,
  });
}

/** What a shop may change on one of its own values: a swatch, as a colour or a picture, sets one and clears the other. */
export type OptionChange = {
  value?: string;
  retired?: boolean;
  swatchColor?: string | null;
  swatchImageId?: string | null;
};

/**
 * PATCH /attributes/:id/options/:optionId: one of the shop's own values renamed, given a swatch (ATR-18), retired or
 * brought back (ATR-10).
 */
export function useUpdateOption() {
  const changed = useAttributesChanged();
  return useMutation({
    mutationFn: ({
      attributeId,
      optionId,
      body,
    }: {
      attributeId: string;
      optionId: string;
      body: OptionChange;
    }) =>
      tenantSession.client.patch<AttributeOption>(
        `/attributes/${attributeId}/options/${optionId}`,
        body,
      ),
    onSuccess: changed,
  });
}

/** The sets read again after one is made or deleted. */
function useOptionSetsChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: OPTION_SETS_QUERY_KEY });
  };
}

/** POST /option-sets: the shop's own set, from an attribute's values or typed, for the next product (ATR-16). */
export function useSaveOptionSet() {
  const changed = useOptionSetsChanged();
  return useMutation({
    mutationFn: (body: { name: string; options: string[] }) =>
      tenantSession.client.post<OptionSet>('/option-sets', body),
    onSuccess: changed,
  });
}

/** DELETE /option-sets/:id: one of the shop's own sets; the library's stay (ATR-16). */
export function useDeleteOptionSet() {
  const changed = useOptionSetsChanged();
  return useMutation({
    mutationFn: (id: string) => tenantSession.client.delete<{ ok: true }>(`/option-sets/${id}`),
    onSuccess: changed,
  });
}
