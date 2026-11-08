import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressRead } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { FraudCheckView, FraudRule, OrderFraudCheck } from '@/types/fraud';
import { BALANCE_QUERY_KEY } from './balance';

// The fake order check (TENANT-DASHBOARD-DESIGN §7.40, Part 37 (c); FRD-01 to FRD-11, D7-45 to D7-52), figures only, and
// reading delivery details from a pasted message (ORD-30 to ORD-34, D7-32 to D7-37). A check is fraud:read; the order's own
// automatic result is orders:read; changing the rule is fraud:manage; reading a message is orders:manage.

export const FRAUD_QUERY_KEY = ['fraud-checks'] as const;

/** GET /fraud-checks?phone= (FRD-01): the phone's latest check, or null; asks no one. */
export function useLatestFraudCheck(phone: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...FRAUD_QUERY_KEY, 'phone', phone],
    queryFn: () =>
      tenantSession.client.get<{ latest: FraudCheckView | null }>(
        `/fraud-checks?phone=${encodeURIComponent(phone ?? '')}`,
      ),
    select: (found) => found.latest,
    enabled: phone !== null && (options.enabled ?? true),
    retry: false,
  });
}

/** POST /fraud-checks (FRD-01): checks the phone now, once per key. */
export function useRunFraudCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ phone, key }: { phone: string; key: string }) =>
      tenantSession.client.request<FraudCheckView>('/fraud-checks', {
        method: 'POST',
        body: JSON.stringify({ phone }),
        headers: { 'Idempotency-Key': key },
      }),
    onSuccess: (check) => {
      queryClient.setQueryData([...FRAUD_QUERY_KEY, 'phone', check.phone], { latest: check });
      void queryClient.invalidateQueries({ queryKey: FRAUD_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
    },
  });
}

/** How often an order being checked is read again, until its result comes. */
const PENDING_REFRESH_MS = 5_000;

/** GET /fraud-checks/orders/:orderId (FRD-05, Slice 7.7): the order's automatic check as it stands. */
export function useOrderFraudCheck(orderId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...FRAUD_QUERY_KEY, 'order', orderId],
    queryFn: () =>
      tenantSession.client.get<OrderFraudCheck>(
        `/fraud-checks/orders/${encodeURIComponent(orderId)}`,
      ),
    enabled: options.enabled ?? true,
    refetchInterval: (query) =>
      query.state.data?.state === 'pending' ? PENDING_REFRESH_MS : false,
  });
}

/** GET /fraud-checks/rule (FRD-05). */
export function useFraudRule(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...FRAUD_QUERY_KEY, 'rule'],
    queryFn: () => tenantSession.client.get<FraudRule>('/fraud-checks/rule'),
    enabled: options.enabled ?? true,
  });
}

/** PUT /fraud-checks/rule (FRD-05, fraud:manage). */
export function useSaveFraudRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule: FraudRule) =>
      tenantSession.client.put<FraudRule>('/fraud-checks/rule', rule),
    onSuccess: (saved) => {
      queryClient.setQueryData([...FRAUD_QUERY_KEY, 'rule'], saved);
    },
  });
}

/** POST /orders/read-address (ORD-30): the delivery details read from a pasted message, nothing saved. */
export function useReadAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      tenantSession.client.post<AddressRead>('/orders/read-address', { text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}
