import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { AddressCheck, ShopTypePreset } from '@/types/onboarding';

/**
 * GET /shops/address-check (AUTH-11, TEN-26): whether an address is free, asked as the owner types (create-shop
 * pauses between keystrokes before asking). An answer holds for half a minute, so typing back to an address asks no
 * more; the server keeps it to 60 a minute.
 */
export function useAddressCheck(address: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: ['address-check', address],
    queryFn: () =>
      tenantSession.client.get<AddressCheck>(
        `/shops/address-check?address=${encodeURIComponent(address)}`,
      ),
    enabled: options.enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/** GET /presets (PST-01, PST-04): the shop types, in the operator's order and words. */
export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: () => tenantSession.client.get<ShopTypePreset[]>('/presets'),
    staleTime: Infinity,
  });
}

/** PUT /business-type (PST-01): what the shop mainly sells; new products take its defaults. */
export function useSetBusinessType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (businessType: string) =>
      tenantSession.client.put<unknown>('/business-type', { businessType }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-type'] });
    },
  });
}

/** The shop's own business type, from GET /product-defaults (PST-02). */
export function useBusinessType(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['business-type'],
    queryFn: () => tenantSession.client.get<{ businessType: string | null }>('/product-defaults'),
    enabled: options.enabled ?? true,
    select: (data) => data.businessType,
  });
}
