import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RateKey, UpdateRateInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { RateHistoryEntry, RateValue } from '@/types/operator';

export const RATES_QUERY_KEY = ['operator', 'rates'] as const;
export const rateHistoryKey = (key: string) => [...RATES_QUERY_KEY, key, 'history'] as const;

export function useRates() {
  return useQuery({
    queryKey: RATES_QUERY_KEY,
    queryFn: () => operatorSession.client.get<RateValue[]>('/operator/rates'),
  });
}

/** RAT-09: one rate's change history, fetched only once its row is expanded. */
export function useRateHistory(key: RateKey | null) {
  return useQuery({
    queryKey: rateHistoryKey(key ?? ''),
    queryFn: () =>
      operatorSession.client.get<RateHistoryEntry[]>(`/operator/rates/${key ?? ''}/history`),
    enabled: key !== null,
  });
}

/** RAT-02: a new value takes effect for the next charge; the old one stays on the history. */
export function useUpdateRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...input }: UpdateRateInput & { key: RateKey }) =>
      operatorSession.client.patch<{ ok: true; id: number }>(`/operator/rates/${key}`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: RATES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: rateHistoryKey(variables.key) });
    },
  });
}

/**
 * NTC-13: one rate change by its history id, wherever it is -- for a notice that tells of it. The history of every
 * shown rate is read (the same reads Rates caches), since no route answers one change alone.
 */
export function useRateChange(id: number | null): {
  change: RateHistoryEntry | null;
  loading: boolean;
} {
  const rates = useRates();
  const histories = useQueries({
    queries: (rates.data ?? []).map((rate) => ({
      queryKey: rateHistoryKey(rate.key),
      queryFn: () =>
        operatorSession.client.get<RateHistoryEntry[]>(`/operator/rates/${rate.key}/history`),
      enabled: id !== null,
    })),
  });
  if (id === null) return { change: null, loading: false };
  const change = histories.flatMap((history) => history.data ?? []).find((line) => line.id === id);
  return {
    change: change ?? null,
    loading: rates.isLoading || histories.some((history) => history.isLoading),
  };
}
