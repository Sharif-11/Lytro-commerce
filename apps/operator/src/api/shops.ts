import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustBalanceInput,
  DeleteShopDataInput,
  ExtendPlanInput,
  NewShopCapInput,
  OwnerResetInput,
  SalesBucket,
  SetPlanLimitOverrideInput,
  SuspendTenantInput,
  TenantSort,
  TenantState,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type {
  CredentialUsePage,
  LedgerEntry,
  OperatorShop,
  PlanLimitOverride,
  QueuedPayment,
  ShopAddons,
  TenantSummaryPage,
} from '@/types/operator';
import type {
  PlanExtension,
  PlatformAuditPage,
  ShopErrorPage,
  ShopFailedSmsLists,
  ShopFigures,
  ShopSales,
} from '@/types/shop-figures';
import type { CourierKeyUsePage } from '@/types/couriers';

// api/plans.ts's assignment refreshes these too.
export const SHOPS_QUERY_KEY = ['operator', 'tenants'] as const;
const PAGE_SIZE = 20;

const shopKey = (id: string) => [...SHOPS_QUERY_KEY, 'one', id] as const;

/** ADM-02, D8-7: what the list is narrowed to and in which order; each page keeps its own keyset. */
export interface ShopFilters {
  state?: TenantState;
  planId?: string;
  sort?: TenantSort;
}

/** GET /operator/tenants is cursor-paginated (never OFFSET); each query or filter change starts a fresh list. */
export function useSearchShops(query: string, filters: ShopFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...SHOPS_QUERY_KEY, 'search', query, filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (filters.state) params.set('state', filters.state);
      if (filters.planId) params.set('planId', filters.planId);
      if (filters.sort) params.set('sort', filters.sort);
      params.set('limit', String(PAGE_SIZE));
      if (pageParam) params.set('cursor', pageParam);
      return operatorSession.client.get<TenantSummaryPage>(
        `/operator/tenants?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** One shop's page: its plan's version, who suspended it and why, its payment page, the new-shop cap. */
export function useShop(id: string, enabled = true) {
  return useQuery({
    queryKey: shopKey(id),
    queryFn: () => operatorSession.client.get<OperatorShop>(`/operator/tenants/${id}`),
    enabled: enabled && id !== '',
  });
}

/** Its running add-ons and packs, and each limit as its plan, override and add-ons make it. */
export function useShopAddons(id: string) {
  return useQuery({
    queryKey: [...shopKey(id), 'addons'],
    queryFn: () => operatorSession.client.get<ShopAddons>(`/operator/tenants/${id}/addons`),
  });
}

/** SEC-11: its stored gateway keys' uses, newest first, never the keys. */
export function useCredentialUses(id: string, page: number, limit: number) {
  return useQuery({
    queryKey: [...shopKey(id), 'credential-uses', page, limit],
    queryFn: () =>
      operatorSession.client.get<CredentialUsePage>(
        `/operator/tenants/${id}/gateway-credential-uses?page=${String(page)}&limit=${String(limit)}`,
      ),
  });
}

function useShopWrite<Input extends { shopId: string }, Answer>(
  write: (input: Input) => Promise<Answer>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SHOPS_QUERY_KEY });
    },
  });
}

/** LIF-24: suspension for cause, with the reason the seller will be shown. */
export function useSuspendShop() {
  return useShopWrite(({ shopId, ...input }: SuspendTenantInput & { shopId: string }) =>
    operatorSession.client.post<{ ok: true }>(`/operator/tenants/${shopId}/suspend`, input),
  );
}

export function useRestoreShop() {
  return useShopWrite(({ shopId }: { shopId: string }) =>
    operatorSession.client.post<{ ok: true }>(`/operator/tenants/${shopId}/restore`),
  );
}

/** BAL-12: a correction on a shop's balance, positive or negative, always with a reason. */
export function useAdjustBalance() {
  return useShopWrite(({ shopId, ...input }: AdjustBalanceInput & { shopId: string }) =>
    operatorSession.client.post<LedgerEntry>(`/operator/tenants/${shopId}/balance-adjust`, input),
  );
}

/** TVR-03: the payment page alone, apart from suspending the whole shop. */
export function useSuspendPage() {
  return useShopWrite(({ shopId, ...input }: SuspendTenantInput & { shopId: string }) =>
    operatorSession.client.post<{ ok: true }>(
      `/operator/tenants/${shopId}/payment-page/suspend`,
      input,
    ),
  );
}

export function useRestorePage() {
  return useShopWrite(({ shopId }: { shopId: string }) =>
    operatorSession.client.post<{ ok: true }>(`/operator/tenants/${shopId}/payment-page/restore`),
  );
}

/** TVR-04: on, off, or null for what the shop's kind says. */
export function useSetNewShopCap() {
  return useShopWrite(({ shopId, ...input }: NewShopCapInput & { shopId: string }) =>
    operatorSession.client.post<{ ok: true }>(`/operator/tenants/${shopId}/new-shop-cap`, input),
  );
}

/** PLN-11: the limit overrides a shop carries over its plan. */
export function useLimitOverrides(id: string) {
  return useQuery({
    queryKey: [...shopKey(id), 'limit-overrides'],
    queryFn: () =>
      operatorSession.client.get<PlanLimitOverride[]>(`/operator/tenants/${id}/limit-overrides`),
  });
}

export function useSetLimitOverride() {
  return useShopWrite(({ shopId, ...input }: SetPlanLimitOverrideInput & { shopId: string }) =>
    operatorSession.client.post<PlanLimitOverride>(
      `/operator/tenants/${shopId}/limit-overrides`,
      input,
    ),
  );
}

export function useRemoveLimitOverride() {
  return useShopWrite(({ shopId, limitKey }: { shopId: string; limitKey: string }) =>
    operatorSession.client.delete<{ ok: true }>(
      `/operator/tenants/${shopId}/limit-overrides/${limitKey}`,
    ),
  );
}

/** ADM-03 (Slice 8.2): the figures the shop page opens with, read inside the shop. */
export function useShopFigures(id: string) {
  return useQuery({
    queryKey: [...shopKey(id), 'figures'],
    queryFn: () => operatorSession.client.get<ShopFigures>(`/operator/tenants/${id}/figures`),
  });
}

/** D8-23, D8-25: the shop's kept server faults, newest first, a page at a time; loaded when its card is opened. */
export function useShopErrors(id: string) {
  return useInfiniteQuery({
    queryKey: [...shopKey(id), 'errors'],
    queryFn: ({ pageParam }) =>
      operatorSession.client.get<ShopErrorPage>(
        `/operator/tenants/${id}/errors${pageParam === undefined ? '' : `?before=${String(pageParam)}`}`,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });
}

/** D8-30: the SMS that didn't go, the shop's own and Lytro's own to it. */
export function useShopFailedSms(id: string) {
  return useQuery({
    queryKey: [...shopKey(id), 'failed-sms'],
    queryFn: () =>
      operatorSession.client.get<ShopFailedSmsLists>(`/operator/tenants/${id}/failed-sms`),
  });
}

/** D8-26: the courier calls that failed or the courier refused, from the courier key log. */
export function useShopFailedCourierCalls(id: string) {
  return useQuery({
    queryKey: [...shopKey(id), 'failed-courier-calls'],
    queryFn: () =>
      operatorSession.client.get<CourierKeyUsePage>(
        `/operator/tenants/${id}/courier-credential-uses?failed=true&page=1&limit=20`,
      ),
  });
}

/** D8-28: the shop's payments to Lytro waiting in the queue. */
export function useShopPaymentsWaiting(id: string) {
  return useQuery({
    queryKey: [...shopKey(id), 'payments-waiting'],
    queryFn: () =>
      operatorSession.client.get<QueuedPayment[]>(`/operator/tenants/${id}/payments-waiting`),
  });
}

/** STA-01: the shop's own sales in a period, as its Sales page reads them, split by week or month. */
export function useShopSales(
  id: string,
  period: { dateFrom: string; dateTo: string; bucket: SalesBucket },
) {
  return useQuery({
    queryKey: [...shopKey(id), 'sales', period],
    queryFn: () => {
      const params = new URLSearchParams(period);
      return operatorSession.client.get<ShopSales>(
        `/operator/tenants/${id}/sales?${params.toString()}`,
      );
    },
  });
}

/** ADM-08: the last few platform audit entries on this shop. */
export function useShopAudit(id: string, limit: number) {
  return useQuery({
    queryKey: [...shopKey(id), 'audit', limit],
    queryFn: () =>
      operatorSession.client.get<PlatformAuditPage>(
        `/operator/audit?tenantId=${id}&limit=${String(limit)}`,
      ),
  });
}

/** ADM-04, D8-12: whole days added to the period, free, with a reason. */
export function useExtendPlan() {
  return useShopWrite(({ shopId, ...input }: ExtendPlanInput & { shopId: string }) =>
    operatorSession.client.post<PlanExtension>(`/operator/tenants/${shopId}/extend`, input),
  );
}

/** ADM-04, D8-5: the owner signed out everywhere and a reset code sent to the phone they gave. */
export function useOwnerReset() {
  return useShopWrite(({ shopId, ...input }: OwnerResetInput & { shopId: string }) =>
    operatorSession.client.post<{ phoneChanged: boolean }>(
      `/operator/tenants/${shopId}/owner-reset`,
      input,
    ),
  );
}

/** ADM-13, D8-13: the shop offline at once and its data deleted, its address typed to confirm. */
export function useDeleteShopData() {
  return useShopWrite(({ shopId, ...input }: DeleteShopDataInput & { shopId: string }) =>
    operatorSession.client.post<{ ok: true }>(`/operator/tenants/${shopId}/delete-data`, input),
  );
}
