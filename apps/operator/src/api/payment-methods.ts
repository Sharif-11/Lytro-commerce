import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePlatformBankAccountInput,
  PlatformGatewayKeysInput,
  UpdatePlatformBankAccountInput,
  UpdatePlatformPaymentMethodInput,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { LytroBankAccount, LytroGatewayTest, LytroPaymentMethods } from '@/types/operator';

export const PAYMENT_METHODS_QUERY_KEY = ['operator', 'payment-methods'] as const;

function useRefreshMethods(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
  };
}

/** OPERATOR-CONSOLE-DESIGN §10: what shops may pay Lytro by, each method's way, and Lytro's bank accounts. */
export function usePaymentMethods() {
  return useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<LytroPaymentMethods>('/operator/payment-methods'),
  });
}

export function useUpdatePaymentMethod() {
  const refresh = useRefreshMethods();
  return useMutation({
    mutationFn: ({ method, ...input }: UpdatePlatformPaymentMethodInput & { method: string }) =>
      operatorSession.client.patch<LytroPaymentMethods>(
        `/operator/payment-methods/${method}`,
        input,
      ),
    onSuccess: refresh,
  });
}

export function useAddBankAccount() {
  const refresh = useRefreshMethods();
  return useMutation({
    mutationFn: (input: CreatePlatformBankAccountInput) =>
      operatorSession.client.post<LytroBankAccount>(
        '/operator/payment-methods/bank-accounts',
        input,
      ),
    onSuccess: refresh,
  });
}

export function useUpdateBankAccount() {
  const refresh = useRefreshMethods();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePlatformBankAccountInput & { id: string }) =>
      operatorSession.client.patch<LytroBankAccount>(
        `/operator/payment-methods/bank-accounts/${id}`,
        input,
      ),
    onSuccess: refresh,
  });
}

export function useRemoveBankAccount() {
  const refresh = useRefreshMethods();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/payment-methods/bank-accounts/${id}`),
    onSuccess: refresh,
  });
}

/** WAL-09: all four keys, sealed and never shown again. */
export function useSaveGatewayKeys() {
  const refresh = useRefreshMethods();
  return useMutation({
    mutationFn: ({ method, ...input }: PlatformGatewayKeysInput & { method: string }) =>
      operatorSession.client.put<{ ok: true }>(
        `/operator/payment-methods/${method}/gateway`,
        input,
      ),
    onSuccess: refresh,
  });
}

export function useRemoveGatewayKeys() {
  const refresh = useRefreshMethods();
  return useMutation({
    mutationFn: (method: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/payment-methods/${method}/gateway`),
    onSuccess: refresh,
  });
}

/** WAL-13: bKash allows two such calls an hour. */
export function useTestGateway() {
  return useMutation({
    mutationFn: (method: string) =>
      operatorSession.client.post<LytroGatewayTest>(
        `/operator/payment-methods/${method}/gateway/test`,
      ),
  });
}
