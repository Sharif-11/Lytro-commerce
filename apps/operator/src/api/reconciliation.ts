import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReconciliationDifferenceState,
  type ReconciliationDifferenceKind,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { ReconciliationDifference, ReconciliationDifferencePage } from '@/types/operator';

export const RECONCILIATION_QUERY_KEY = ['operator', 'reconciliation'] as const;
// The most differences the server lists on one page (reconciliationListQuerySchema).
export const DIFFERENCES_PER_PAGE = 50;

export interface DifferenceFilter {
  state: ReconciliationDifferenceState;
  day?: string;
  kind?: ReconciliationDifferenceKind;
  page: number;
}

function differencesPath(filter: DifferenceFilter, limit = DIFFERENCES_PER_PAGE): string {
  const params = new URLSearchParams({
    state: filter.state,
    page: String(filter.page),
    limit: String(limit),
  });
  if (filter.day) params.set('day', filter.day);
  if (filter.kind) params.set('kind', filter.kind);
  return `/operator/reconciliation/differences?${params.toString()}`;
}

/** DAT-52 (Slices 9.5, 9.9): what the daily money check found, one state at a time, newest day first. */
export function useDifferences(filter: DifferenceFilter) {
  return useQuery({
    queryKey: [...RECONCILIATION_QUERY_KEY, filter],
    queryFn: () =>
      operatorSession.client.get<ReconciliationDifferencePage>(differencesPath(filter)),
  });
}

/** How many differences are in one state: the open ones for Today's card and the menu, both for the page's chips. */
export function differenceCountQuery(state: ReconciliationDifferenceState) {
  return {
    queryKey: [...RECONCILIATION_QUERY_KEY, 'count', state],
    queryFn: async () =>
      (
        await operatorSession.client.get<ReconciliationDifferencePage>(
          differencesPath({ state, page: 1 }, 1),
        )
      ).total,
  };
}

export function openDifferencesQuery() {
  return differenceCountQuery(ReconciliationDifferenceState.Open);
}

export function useDifferenceCount(state: ReconciliationDifferenceState) {
  return useQuery(differenceCountQuery(state));
}

/** The operator's word on what was done; kept with the difference and in the platform audit log. */
export function useResolveDifference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      operatorSession.client.post<ReconciliationDifference>(
        `/operator/reconciliation/differences/${id}/resolve`,
        { note },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RECONCILIATION_QUERY_KEY });
    },
  });
}
