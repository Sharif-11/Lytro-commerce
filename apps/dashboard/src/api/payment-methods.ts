import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountMethod,
  GatewayCredentialsInput,
  PaymentMethodInput,
  PaymentWay,
} from '@lytronix/validators';
import { HOME_QUERY_KEY } from '@/api/home';
import { tenantSession } from '@/session/tenant-session';
import type { GatewayTest, PaymentMethodsView } from '@/types/payment-methods';

// Payment methods (TENANT-DASHBOARD-DESIGN §7.35, Slice 5.8's part 1; WAL-01 to WAL-21). Reading needs wallets:read,
// changing is the owner's alone (WAL-07). Most writes answer with the methods as they now are.

export const PAYMENT_METHODS_QUERY_KEY = ['payment-methods'] as const;

/** GET /payment-methods: every method with its accounts, and whether the owner's phone is verified. */
export function usePaymentMethods() {
  return useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<PaymentMethodsView>('/payment-methods'),
  });
}

/** After a write that answers with the methods: its answer is the page now, and the checklist's wallet item may tick. */
function useChanged(): (view: PaymentMethodsView) => void {
  const queryClient = useQueryClient();
  return (view) => {
    queryClient.setQueryData(PAYMENT_METHODS_QUERY_KEY, view);
    void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
  };
}

/** After a write that doesn't: reads the page again. */
function useRefetch(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
}

/** PUT /payment-methods/:method: one method's whole list of accounts, and whether it is on. */
export function useSaveMethod() {
  const changed = useChanged();
  return useMutation({
    mutationFn: ({ method, input }: { method: AccountMethod; input: PaymentMethodInput }) =>
      tenantSession.client.put<PaymentMethodsView>(`/payment-methods/${method}`, input),
    onSuccess: changed,
  });
}

/** PUT /payment-methods/:method/way: how the shop takes this method's money (PAY-06). */
export function useChooseWay() {
  const changed = useChanged();
  return useMutation({
    mutationFn: ({ method, way }: { method: AccountMethod; way: PaymentWay }) =>
      tenantSession.client.put<PaymentMethodsView>(`/payment-methods/${method}/way`, { way }),
    onSuccess: changed,
  });
}

/** PUT /payment-methods/accounts/:id/gateway: all four keys, sealed and never shown again (WAL-09). */
export function useSaveGatewayKeys() {
  const refetch = useRefetch();
  return useMutation({
    mutationFn: ({ accountId, input }: { accountId: string; input: GatewayCredentialsInput }) =>
      tenantSession.client.put<{ ok: true }>(
        `/payment-methods/accounts/${accountId}/gateway`,
        input,
      ),
    onSuccess: refetch,
  });
}

/** DELETE /payment-methods/accounts/:id/gateway. */
export function useRemoveGatewayKeys() {
  const refetch = useRefetch();
  return useMutation({
    mutationFn: (accountId: string) =>
      tenantSession.client.request<{ ok: true }>(`/payment-methods/accounts/${accountId}/gateway`, {
        method: 'DELETE',
      }),
    onSuccess: refetch,
  });
}

/** POST /payment-methods/accounts/:id/gateway/test: bKash allows two such calls an hour (WAL-13). */
export function useTestGateway() {
  return useMutation({
    mutationFn: (accountId: string) =>
      tenantSession.client.post<GatewayTest>(`/payment-methods/accounts/${accountId}/gateway/test`),
  });
}

/** POST /payment-methods/accounts/:id/automated: this account takes the method's automated payments (WAL-10). */
export function useSelectAutomated() {
  const changed = useChanged();
  return useMutation({
    mutationFn: (accountId: string) =>
      tenantSession.client.post<PaymentMethodsView>(
        `/payment-methods/accounts/${accountId}/automated`,
      ),
    onSuccess: changed,
  });
}

/** GET /listener/devices, for how many phones are paired (LSN-20). */
export function useListenerPhones(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['listener', 'devices'],
    queryFn: () => tenantSession.client.get<{ active: number }>('/listener/devices'),
    enabled: options.enabled ?? true,
  });
}
