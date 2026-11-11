import { useQuery } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';
import type { MediaCosts } from '@/types/records';

/**
 * MED-12, D8-57 (Slice 8.6): one billing period's Cloudflare costs so far, against the budget. `period` is a day in the
 * period wanted; none is the running one.
 */
export function useMediaCosts(period: string | undefined) {
  return useQuery({
    queryKey: ['operator', 'media-costs', period ?? 'now'],
    queryFn: () =>
      operatorSession.client.get<MediaCosts>(
        period ? `/operator/media-costs?period=${period}` : '/operator/media-costs',
      ),
  });
}
