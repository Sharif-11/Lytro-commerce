import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  OrderStatus,
  type CallOutcome,
  type CancelReason,
  type StatusOverride,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { Order, OrderPage } from '@/types/orders';
import { PRODUCTS_QUERY_KEY } from './catalogue';
import { HOME_QUERY_KEY } from './home';

// Orders (TENANT-DASHBOARD-DESIGN §7.31, Slice 4.8a; ORD-01 to ORD-52). Reading needs orders:read, changing
// orders:manage, deleting orders:delete. A change also reads Home again (its jobs and the Orders tab's count) and, when
// it holds or lets go of stock, the products.

export const ORDERS_QUERY_KEY = ['orders'] as const;

/** The list's tabs, the day's work first (agreed in the 4.8a read); the rest sit under More. */
export const ORDER_TABS = ['pending', 'confirmed', 'hold', 'shipped', 'all'] as const;
export const MORE_TABS = ['delivered', 'returned', 'cancelled'] as const;
export const ALL_TABS = [...ORDER_TABS, ...MORE_TABS] as const;
export type OrderTab = (typeof ALL_TABS)[number];

/** The visible status (ORD-41) each tab asks for; All asks for none. */
const STATUS_OF: Record<OrderTab, OrderStatus | null> = {
  pending: OrderStatus.Pending,
  confirmed: OrderStatus.Confirmed,
  hold: OrderStatus.Hold,
  shipped: OrderStatus.Shipped,
  all: null,
  delivered: OrderStatus.Delivered,
  returned: OrderStatus.Returned,
  cancelled: OrderStatus.Cancelled,
};

export interface OrderFilter {
  tab: OrderTab;
  /** Part of the name or phone, or the order number (ORD-13). */
  q?: string;
  /** Calendar days in Asia/Dhaka, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** Cancelled only (ORD-52). */
  reason?: CancelReason;
}

function query(filter: OrderFilter, extra: Record<string, string>): string {
  const status = STATUS_OF[filter.tab];
  return new URLSearchParams({
    ...(status ? { status } : {}),
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.from ? { dateFrom: filter.from } : {}),
    ...(filter.to ? { dateTo: filter.to } : {}),
    ...(filter.reason && filter.tab === 'cancelled' ? { cancelReason: filter.reason } : {}),
    ...extra,
  }).toString();
}

/** GET /orders (ORD-13): one tab, newest first, a page at a time ("Show more"). */
export function useOrders(filter: OrderFilter) {
  return useInfiniteQuery({
    queryKey: [...ORDERS_QUERY_KEY, 'list', filter],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<OrderPage>(`/orders?${query(filter, { page: String(pageParam) })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** How many orders a tab holds (Cancelled, for one reason), for its chip; never narrowed by the search. */
export function useOrderCount(
  tab: OrderTab,
  options: { enabled?: boolean; reason?: CancelReason } = {},
) {
  const { reason } = options;
  return useQuery({
    queryKey: [...ORDERS_QUERY_KEY, 'count', tab, reason ?? null],
    queryFn: () =>
      tenantSession.client.get<OrderPage>(`/orders?${query({ tab, reason }, { limit: '1' })}`),
    select: (page) => page.total,
    enabled: options.enabled ?? true,
  });
}

/** GET /orders/:id (ORD-14): one order with its items, calls, payments and history. */
export function useOrder(id: string | null) {
  return useQuery({
    queryKey: [...ORDERS_QUERY_KEY, id],
    queryFn: () => tenantSession.client.get<Order>(`/orders/${id ?? ''}`),
    enabled: id !== null,
  });
}

/** After a change: the order as it now is, the lists and counts, Home, and the stock when it moved. */
function useOrderChanged(stock: boolean): (order?: Order) => void {
  const queryClient = useQueryClient();
  return (order) => {
    if (order) queryClient.setQueryData([...ORDERS_QUERY_KEY, order.id], order);
    void queryClient.invalidateQueries({
      queryKey: ORDERS_QUERY_KEY,
      predicate: (each) => each.queryKey[1] === 'list' || each.queryKey[1] === 'count',
    });
    void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    if (stock) void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** What a call log sends (ORD-51). */
export type CallBody =
  | { outcome: CallOutcome.Confirmed | CallOutcome.NoAnswer; note?: string }
  | { outcome: CallOutcome.CallBackLater; callBackAt: string; note?: string }
  | { outcome: CallOutcome.Cancelled; reason: CancelReason; note?: string };

/** POST /orders/:id/calls (ORD-51): how a call went; confirming confirms, call later holds, cancelling cancels. */
export function useLogCall(id: string) {
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: (body: CallBody) => tenantSession.client.post<Order>(`/orders/${id}/calls`, body),
    onSuccess: changed,
  });
}

/** POST /orders/:id/cancel (ORD-52): cancelled with its reason, the stock it holds let go. */
export function useCancelOrder(id: string) {
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: (body: { reason: CancelReason; note?: string }) =>
      tenantSession.client.post<Order>(`/orders/${id}/cancel`, body),
    onSuccess: changed,
  });
}

/** POST /orders/:id/override (ORD-41): a hold released, the worked-out status shown again. */
export function useSetOverride(id: string) {
  const changed = useOrderChanged(false);
  return useMutation({
    mutationFn: (override: StatusOverride | null) =>
      tenantSession.client.post<Order>(`/orders/${id}/override`, { override }),
    onSuccess: changed,
  });
}

/** DELETE /orders/:id (ORD-12): a mistake deleted before it ships or is paid, its stock let go. */
export function useDeleteOrder(id: string) {
  const queryClient = useQueryClient();
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: () => tenantSession.client.delete<{ ok: true }>(`/orders/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...ORDERS_QUERY_KEY, id] });
      changed();
    },
  });
}

/** POST /orders/:id/deliver (ORD-42): a shipped order delivered, what was due recorded as cash on delivery. */
export function useDeliver(id: string) {
  const changed = useOrderChanged(false);
  return useMutation({
    mutationFn: () => tenantSession.client.post<Order>(`/orders/${id}/deliver`, {}),
    onSuccess: changed,
  });
}

/** POST /orders/:id/hand-over: a takeaway or dine-in order given over, delivered and paid in one step. */
export function useHandOver(id: string) {
  const changed = useOrderChanged(true);
  return useMutation({
    mutationFn: (body: { serials?: { lineId: string; serials: string[] }[] } = {}) =>
      tenantSession.client.post<Order>(`/orders/${id}/hand-over`, body),
    onSuccess: changed,
  });
}
