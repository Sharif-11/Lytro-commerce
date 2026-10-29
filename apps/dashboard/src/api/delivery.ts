import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type {
  AreasInput,
  DeliverySettings,
  HomeAreaInput,
  Locations,
  ResolvedZone,
} from '@/types/delivery';
import { SHOP_SETTINGS_QUERY_KEY } from './shop-settings';

// Delivery (TENANT-DASHBOARD-DESIGN §7.10, Slice 11.11; DLV-01 to DLV-07, RAT-14): the canonical locations, the shop's
// zones and its extra charge per kg. Reading needs products:read, changing settings:manage. Every write answers with
// the settings as they now are, kept as the read's answer.

const DELIVERY_QUERY_KEY = ['delivery-settings'] as const;

/** GET /locations (CUS-08): the city areas and the zillas with their thanas; the same for every shop. */
export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => tenantSession.client.get<Locations>('/locations'),
    staleTime: Infinity,
  });
}

/** GET /delivery-zones (DLV-05): the home area, the zones with their charges and areas, and the charge per kg. */
export function useDeliverySettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: DELIVERY_QUERY_KEY,
    queryFn: () => tenantSession.client.get<DeliverySettings>('/delivery-zones'),
    enabled: options.enabled ?? true,
  });
}

/** After a write: its answer is the settings now, and an address checked before is checked again. */
function useSettingsChanged(): (settings: DeliverySettings) => void {
  const queryClient = useQueryClient();
  return (settings) => {
    queryClient.setQueryData(DELIVERY_QUERY_KEY, settings);
    void queryClient.invalidateQueries({ queryKey: [...DELIVERY_QUERY_KEY, 'resolve'] });
  };
}

/** PUT /delivery-zones/home-area (DLV-01): the two fixed zones follow it, unless the shop named them. */
export function useSetHomeArea() {
  const changed = useSettingsChanged();
  return useMutation({
    mutationFn: (input: HomeAreaInput) =>
      tenantSession.client.put<DeliverySettings>('/delivery-zones/home-area', input),
    onSuccess: changed,
  });
}

/** A zone's details as sent; a null name puts a fixed zone back on its automatic name. */
export interface ZoneChange {
  name?: string | null;
  charge?: number;
  noDelivery?: boolean;
}

/** POST /delivery-zones (DLV-01): one more zone, up to the most there may be. */
export function useCreateZone() {
  const changed = useSettingsChanged();
  return useMutation({
    mutationFn: (body: { name: string; charge: number; noDelivery: boolean; areas: AreasInput }) =>
      tenantSession.client.post<DeliverySettings>('/delivery-zones', body),
    onSuccess: changed,
  });
}

/** PATCH /delivery-zones/:id (DLV-01, DLV-04, DLV-06): renamed, re-priced, or no delivery; past orders keep theirs. */
export function useUpdateZone() {
  const changed = useSettingsChanged();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ZoneChange }) =>
      tenantSession.client.patch<DeliverySettings>(`/delivery-zones/${id}`, body),
    onSuccess: changed,
  });
}

/** PUT /delivery-zones/:id/areas (DLV-01, DLV-02): one of the shop's own zones' areas, all at once. */
export function useSetZoneAreas() {
  const changed = useSettingsChanged();
  return useMutation({
    mutationFn: ({ id, areas }: { id: string; areas: AreasInput }) =>
      tenantSession.client.put<DeliverySettings>(`/delivery-zones/${id}/areas`, { areas }),
    onSuccess: changed,
  });
}

/** DELETE /delivery-zones/:id (DLV-01, DLV-07): refused while a product's delivery limit names it. */
export function useDeleteZone() {
  const changed = useSettingsChanged();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.delete<DeliverySettings>(`/delivery-zones/${id}`),
    onSuccess: changed,
  });
}

/** PATCH /shop-settings (RAT-14): the extra charge per kg; the zones' read carries it too. */
export function useSetChargePerKg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extraDeliveryChargePerKg: number) =>
      tenantSession.client.patch<unknown>('/shop-settings', { extraDeliveryChargePerKg }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SHOP_SETTINGS_QUERY_KEY });
    },
  });
}

/** GET /delivery-zones/resolve (DLV-02, Check an address): the zone a thana falls in, and why. */
export function useResolveZone(locationId: number | null) {
  return useQuery({
    queryKey: [...DELIVERY_QUERY_KEY, 'resolve', locationId],
    queryFn: () =>
      tenantSession.client.get<ResolvedZone>(
        `/delivery-zones/resolve?locationId=${String(locationId)}`,
      ),
    enabled: locationId !== null,
  });
}
