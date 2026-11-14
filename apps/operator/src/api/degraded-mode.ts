import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';
import type { DegradedModeState } from '@/types/operator';
import { SETTINGS_QUERY_KEY } from './settings';

export const DEGRADED_MODE_QUERY_KEY = ['operator', 'degraded-mode'] as const;

/** DAT-38, D9-14 (Slices 9.5, 9.9): degraded mode, the console's "Limited mode", as it stands now. */
export function useDegradedMode() {
  return useQuery({
    queryKey: DEGRADED_MODE_QUERY_KEY,
    queryFn: () => operatorSession.client.get<DegradedModeState>('/operator/degraded-mode'),
  });
}

/** Turns it on or off: the server posts or withdraws the shops' notice, and audits the change. */
export function useTurnDegradedMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) =>
      operatorSession.client.put<DegradedModeState>('/operator/degraded-mode', { on }),
    onSuccess: (state) => {
      queryClient.setQueryData(DEGRADED_MODE_QUERY_KEY, state);
      // Who turned it on, and when, is the setting's own record.
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}
