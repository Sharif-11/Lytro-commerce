import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustBalanceInput,
  SetPlanLimitOverrideInput,
  SuspendTenantInput,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { LedgerEntry, PlanLimitOverride, TenantSummaryPage } from '@/types/operator';

export const TENANTS_QUERY_KEY = ['operator', 'tenants'] as const;
export const limitOverridesKey = (tenantId: string) =>
  [...TENANTS_QUERY_KEY, tenantId, 'limit-overrides'] as const;
const PAGE_SIZE = 20;

/** GET /operator/tenants is cursor-paginated (never OFFSET); each query change starts a fresh list. */
export function useSearchTenants(query: string) {
  return useInfiniteQuery({
    queryKey: [...TENANTS_QUERY_KEY, 'search', query],
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

/** LIF-24: suspension for cause, with the reason the seller will be shown. */
export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, ...input }: SuspendTenantInput & { tenantId: string }) =>
      operatorSession.client.post<{ ok: true }>(`/operator/tenants/${tenantId}/suspend`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TENANTS_QUERY_KEY });
    },
  });
}

export function useRestoreTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      operatorSession.client.post<{ ok: true }>(`/operator/tenants/${tenantId}/restore`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TENANTS_QUERY_KEY });
    },
  });
}

/** BAL-12: an operator correction on a tenant's balance, positive or negative, always with a reason. */
export function useAdjustBalance() {
  return useMutation({
    mutationFn: ({ tenantId, ...input }: AdjustBalanceInput & { tenantId: string }) =>
      operatorSession.client.post<LedgerEntry>(
        `/operator/tenants/${tenantId}/balance-adjust`,
        input,
      ),
  });
}

/** PLN-11: the limit overrides one tenant carries over its plan. */
export function useLimitOverrides(tenantId: string | null) {
  return useQuery({
    queryKey: limitOverridesKey(tenantId ?? ''),
    queryFn: () =>
      operatorSession.client.get<PlanLimitOverride[]>(
        `/operator/tenants/${tenantId ?? ''}/limit-overrides`,
      ),
    enabled: tenantId !== null,
  });
}

export function useSetLimitOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, ...input }: SetPlanLimitOverrideInput & { tenantId: string }) =>
      operatorSession.client.post<PlanLimitOverride>(
        `/operator/tenants/${tenantId}/limit-overrides`,
        input,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: limitOverridesKey(variables.tenantId) });
    },
  });
}

export function useRemoveLimitOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, limitKey }: { tenantId: string; limitKey: string }) =>
      operatorSession.client.delete<{ ok: true }>(
        `/operator/tenants/${tenantId}/limit-overrides/${limitKey}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: limitOverridesKey(variables.tenantId) });
    },
  });
}
