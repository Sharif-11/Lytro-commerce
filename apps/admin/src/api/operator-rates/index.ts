import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RateKey, UpdateRateInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { RateValue } from '@/types/balance';
import type { RateHistoryEntry } from '@/types/billing-admin';

export const OPERATOR_RATES_QUERY_KEY = ['operator', 'rates'] as const;
export const operatorRateHistoryKey = (key: RateKey) =>
  ['operator', 'rates', key, 'history'] as const;

export function useOperatorRates() {
  return useQuery({
    queryKey: OPERATOR_RATES_QUERY_KEY,
    queryFn: () => operatorSession.client.get<RateValue[]>('/operator/rates'),
  });
}

/** RAT-09: the change history for one rate, fetched only once its row's history is expanded. */
export function useRateHistory(key: RateKey | null) {
  return useQuery({
    queryKey: operatorRateHistoryKey(key as RateKey),
    queryFn: () =>
      operatorSession.client.get<RateHistoryEntry[]>(`/operator/rates/${key ?? ''}/history`),
    enabled: key !== null,
  });
}

export function useUpdateRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...input }: UpdateRateInput & { key: RateKey }) =>
      operatorSession.client.patch<{ ok: true }>(`/operator/rates/${key}`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_RATES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: operatorRateHistoryKey(variables.key) });
    },
  });
}
