import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SuspendTenantInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { TenantSummaryPage } from '@/types/tenant';

export const OPERATOR_TENANTS_QUERY_KEY = ['operator', 'tenants'] as const;
const PAGE_SIZE = 20;

/** LIF-24: GET /operator/tenants is cursor-paginated (never OFFSET, same discipline as the ledger/activity
    lists) -- useInfiniteQuery maps onto that cursor the same way useLedger does. Re-queried fresh on every
    `query` change rather than filtered client-side, since the full tenant list could be large. */
export function useSearchTenants(query: string) {
  return useInfiniteQuery({
    queryKey: [...OPERATOR_TENANTS_QUERY_KEY, query],
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

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, ...input }: SuspendTenantInput & { tenantId: string }) =>
      operatorSession.client.post<{ ok: true }>(`/operator/tenants/${tenantId}/suspend`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_TENANTS_QUERY_KEY });
    },
  });
}

export function useRestoreTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      operatorSession.client.post<{ ok: true }>(`/operator/tenants/${tenantId}/restore`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_TENANTS_QUERY_KEY });
    },
  });
}
