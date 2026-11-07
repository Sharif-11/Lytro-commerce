import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookOrderInput,
  CancelParcelInput,
  ConnectCourierInput,
  CourierKey,
  SettleParcelInput,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type {
  CourierAdapter,
  CourierAreaChoice,
  CourierConnected,
  CourierConnection,
  CourierPayoutDetail,
  CourierPayoutPage,
  MessageAddress,
  PickupStore,
} from '@/types/couriers';
import type { Order } from '@/types/orders';
import { HOME_QUERY_KEY } from './home';
import { useOrderChanged } from './orders';

// Couriers (TENANT-DASHBOARD-DESIGN §7.39, Phase 6 Slices 6.1 to 6.7; CRR-01 to CRR-29). Connecting is couriers:manage; whoever
// may book (orders:manage) sees which couriers are connected, never their keys. Payouts are payments:read. A booking, settling,
// cancelling, Sync and Mark as seen answer with the order, which the order's own reads then show.

export const COURIERS_QUERY_KEY = ['couriers'] as const;

/** A connection changed: the couriers, and Home's checklist ("Connect a courier"), read again. */
function useCouriersChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: COURIERS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
  };
}

/** GET /couriers/adapters (CRR-01): the couriers the shop may connect; a retiring one only if already connected. */
export function useCourierAdapters(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, 'adapters'],
    queryFn: () => tenantSession.client.get<{ adapters: CourierAdapter[] }>('/couriers/adapters'),
    select: (found) => found.adapters,
    enabled: options.enabled ?? true,
  });
}

/** GET /couriers/connections (CRR-03): the shop's connected couriers, the default among them. */
export function useCourierConnections(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, 'connections'],
    queryFn: () =>
      tenantSession.client.get<{ connections: CourierConnection[] }>('/couriers/connections'),
    select: (found) => found.connections,
    enabled: options.enabled ?? true,
  });
}

/**
 * POST /couriers/connections (CRR-02, CRR-03): connect, replace keys (a blank field keeps what is saved) or, for Pathao, log in
 * again. The courier checks the keys once and makes no parcel; it answers with the address to paste.
 */
export function useConnectCourier() {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (body: ConnectCourierInput) =>
      tenantSession.client.post<CourierConnected>('/couriers/connections', body),
    onSuccess: changed,
  });
}

/** DELETE /couriers/connections/:key (CRR-20): its keys and address go; past parcels keep their record. */
export function useDisconnectCourier() {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (key: CourierKey) =>
      tenantSession.client.delete<{ ok: true }>(`/couriers/connections/${key}`),
    onSuccess: changed,
  });
}

/** GET /couriers/connections/:key/address: what to paste into the courier's panel, shown again at any time. */
export function useCourierAddress(key: CourierKey, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, key, 'address'],
    queryFn: () => tenantSession.client.get<MessageAddress>(`/couriers/connections/${key}/address`),
    enabled: options.enabled ?? true,
  });
}

/** POST /couriers/connections/:key/address: a new address and token; the old pair stops at once. */
export function useNewCourierAddress(key: CourierKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      tenantSession.client.post<MessageAddress>(`/couriers/connections/${key}/address`),
    onSuccess: (address) => {
      queryClient.setQueryData([...COURIERS_QUERY_KEY, key, 'address'], address);
      void queryClient.invalidateQueries({ queryKey: [...COURIERS_QUERY_KEY, 'connections'] });
    },
  });
}

/** GET /couriers/connections/:key/stores (Slice 6.3): the stores the courier lists, and which one parcels leave from. */
export function usePickupStores(key: CourierKey, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, key, 'stores'],
    queryFn: () =>
      tenantSession.client.get<{ stores: PickupStore[]; chosenId: string | null }>(
        `/couriers/connections/${key}/stores`,
      ),
    enabled: options.enabled ?? true,
  });
}

/** PUT /couriers/connections/:key/store: the one store this courier's parcels leave from. */
export function useSetPickupStore(key: CourierKey) {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (storeId: string) =>
      tenantSession.client.put<CourierConnection>(`/couriers/connections/${key}/store`, {
        storeId,
      }),
    onSuccess: changed,
  });
}

/** PUT /couriers/connections/:key/default (CRR-05): the courier booking starts from. */
export function useSetDefaultCourier() {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (key: CourierKey) =>
      tenantSession.client.put<CourierConnection>(`/couriers/connections/${key}/default`),
    onSuccess: changed,
  });
}

/** GET /couriers/:key/areas (CUS-12): the order's thana's areas first, then the district's matching a search. */
export function useCourierAreas(
  key: CourierKey,
  orderId: string,
  q: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, key, 'areas', orderId, q],
    queryFn: () =>
      tenantSession.client.get<{ thana: CourierAreaChoice[]; zilla: CourierAreaChoice[] }>(
        `/couriers/${key}/areas?${new URLSearchParams({ orderId, ...(q ? { q } : {}) }).toString()}`,
      ),
    enabled: options.enabled ?? true,
  });
}

/** GET /couriers/payouts (CRR-17): what couriers paid the shop, newest first, a page at a time. */
export function useCourierPayouts(options: { courierKey?: CourierKey; enabled?: boolean } = {}) {
  const { courierKey } = options;
  return useInfiniteQuery({
    queryKey: [...COURIERS_QUERY_KEY, 'payouts', courierKey ?? null],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<CourierPayoutPage>(
        `/couriers/payouts?${new URLSearchParams({
          page: String(pageParam),
          ...(courierKey ? { courierKey } : {}),
        }).toString()}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: options.enabled ?? true,
  });
}

/** GET /couriers/payouts/:id (CRR-17): one payout, with the shop's orders it settled. */
export function useCourierPayout(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, 'payouts', 'one', id],
    queryFn: () => tenantSession.client.get<CourierPayoutDetail>(`/couriers/payouts/${id}`),
    enabled: options.enabled ?? true,
  });
}

/**
 * POST /orders/:id/book (CRR-05 to CRR-10, D6-7): the courier called, then the order handled, its stock out. Once per key
 * however often it is sent, so a retried tap never books twice.
 */
export function useBookOrder(id: string) {
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: ({ body, key }: { body: BookOrderInput; key: string }) =>
      tenantSession.client.request<Order>(`/orders/${id}/book`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': key },
      }),
    onSuccess: changed,
  });
}

/** POST /orders/:id/parcel/settle (D6-11, CRR-18): a lost answer settled from the courier's panel, or Try again. */
export function useSettleParcel(id: string) {
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: (body: SettleParcelInput) =>
      tenantSession.client.post<Order>(`/orders/${id}/parcel/settle`, body),
    onSuccess: changed,
  });
}

/** POST /orders/:id/parcel/sync (CRR-14): ask the courier now; inside 10 minutes the saved answer shows. */
export function useSyncParcel(id: string) {
  const changed = useOrderChanged(false);
  return useMutation({
    mutationFn: () => tenantSession.client.post<Order>(`/orders/${id}/parcel/sync`),
    onSuccess: changed,
  });
}

/** POST /orders/:id/parcel/cancel (CRR-28): only the booking is called off; the order stays, to book again or ship by hand. */
export function useCancelBooking(id: string) {
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: (body: CancelParcelInput) =>
      tenantSession.client.post<Order>(`/orders/${id}/parcel/cancel`, body),
    onSuccess: changed,
  });
}

/** POST /orders/:id/parcel/seen (Slice 6.7): what a courier reported was checked, so it leaves Needs a look. */
export function useParcelSeen(id: string) {
  const changed = useOrderChanged(false);
  return useMutation({
    mutationFn: () => tenantSession.client.post<Order>(`/orders/${id}/parcel/seen`),
    onSuccess: changed,
  });
}
