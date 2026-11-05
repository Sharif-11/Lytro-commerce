import { useQuery } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';
import type { RecentChange } from '@/types/operator';

/** Today's "Recent changes": the last rate and setting changes and suspensions. */
export function useRecentChanges() {
  return useQuery({
    queryKey: ['operator', 'recent-changes'],
    queryFn: () => operatorSession.client.get<RecentChange[]>('/operator/recent-changes'),
  });
}
