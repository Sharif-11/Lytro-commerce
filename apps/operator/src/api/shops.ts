import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustBalanceInput,
  NewShopCapInput,
  SetPlanLimitOverrideInput,
  SuspendTenantInput,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type {
  CredentialUsePage,
  LedgerEntry,
  OperatorShop,
  PlanLimitOverride,
  ShopAddons,
  TenantSummaryPage,
} from '@/types/operator';

// api/plans.ts's assignment refreshes these too.
export const SHOPS_QUERY_KEY = ['operator', 'tenants'] as const;
const PAGE_SIZE = 20;

const shopKey = (id: string) => [...SHOPS_QUERY_KEY, 'one', id] as const;

/** GET /operator/tenants is cursor-paginated (never OFFSET); each query change starts a fresh list. */
export function useSearchShops(query: string) {
  return useInfiniteQuery({
    queryKey: [...SHOPS_QUERY_KEY, 'search', query],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
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
export function useShop(id: string) {
  return useQuery({
    queryKey: shopKey(id),
    queryFn: () => operatorSession.client.get<OperatorShop>(`/operator/tenants/${id}`),
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
