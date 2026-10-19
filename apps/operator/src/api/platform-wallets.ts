import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePlatformWalletInput, UpdatePlatformWalletInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { PlatformWallet } from '@/types/operator';

export const PLATFORM_WALLETS_QUERY_KEY = ['operator', 'platform-wallets'] as const;

/** The numbers sellers send payments to (BIL-08), disabled ones included. */
export function usePlatformWallets() {
  return useQuery({
    queryKey: PLATFORM_WALLETS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<PlatformWallet[]>('/operator/platform-wallets'),
  });
}

export function useCreatePlatformWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlatformWalletInput) =>
      operatorSession.client.post<PlatformWallet>('/operator/platform-wallets', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_WALLETS_QUERY_KEY });
    },
  });
}

export function useUpdatePlatformWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePlatformWalletInput & { id: string }) =>
      operatorSession.client.patch<PlatformWallet>(`/operator/platform-wallets/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_WALLETS_QUERY_KEY });
    },
  });
}

export function useDeletePlatformWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/platform-wallets/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_WALLETS_QUERY_KEY });
    },
  });
}
