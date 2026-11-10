import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { WalletType } from '@/types/manual-entries';

export const WALLET_TYPES_QUERY_KEY = ['operator', 'payment-method-types'] as const;

/** WAL-18 (Slice 8.7): every payment method type shops can take, its state and what leans on it. */
export function useWalletTypes() {
  return useQuery({
    queryKey: WALLET_TYPES_QUERY_KEY,
    queryFn: async () =>
      (await operatorSession.client.get<{ types: WalletType[] }>('/operator/payment-method-types'))
        .types,
  });
}

function useTypeChange<T>(method: PaymentMethod, step: 'retire' | 'undo-retire' | 'remove') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      operatorSession.client.post<T>(`/operator/payment-method-types/${method}/${step}`, {
        reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WALLET_TYPES_QUERY_KEY });
    },
  });
}

/** D8-65: shops that never set it up stop seeing it; those that did keep it and are told. */
export function useRetireType(method: PaymentMethod) {
  return useTypeChange<{ type: WalletType; told: number }>(method, 'retire');
}

export function useUndoRetireType(method: PaymentMethod) {
  return useTypeChange<{ type: WalletType; told: number }>(method, 'undo-retire');
}

/** D8-67: once nothing leans on it; every shop's accounts for it go. */
export function useRemoveType(method: PaymentMethod) {
  return useTypeChange<{ type: WalletType; cleared: number }>(method, 'remove');
}
