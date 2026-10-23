import { useMutation, useQuery } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type {
  AddressCheck,
  DeliverySettings,
  HomeAreaInput,
  Locations,
  ShopTypePreset,
} from '@/types/onboarding';

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

/** GET /locations (CUS-08): the city areas and the zillas a home area is picked from. */
export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => tenantSession.client.get<Locations>('/locations'),
    staleTime: Infinity,
  });
}

/** PUT /business-type (PST-01): what the shop mainly sells; new products take its defaults. */
export function useSetBusinessType() {
  return useMutation({
    mutationFn: (businessType: string) =>
      tenantSession.client.put<unknown>('/business-type', { businessType }),
  });
}

/** PUT /delivery-zones/home-area (DLV-01): the two default zones follow it. */
export function useSetHomeArea() {
  return useMutation({
    mutationFn: (input: HomeAreaInput) =>
      tenantSession.client.put<DeliverySettings>('/delivery-zones/home-area', input),
  });
}

/** GET /delivery-zones (DLV-05): the home area and the zones with their charges. */
export function useDeliverySettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['delivery-settings'],
    queryFn: () => tenantSession.client.get<DeliverySettings>('/delivery-zones'),
    enabled: options.enabled ?? true,
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
