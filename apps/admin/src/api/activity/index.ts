import { useInfiniteQuery } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { ActivityPage } from '@/types/activity';

export const ACTIVITY_QUERY_KEY = ['activity'] as const;
const PAGE_SIZE = 50;

export interface ActivityFilters {
  dateFrom?: string;
  dateTo?: string;
  actorId?: string;
  action?: string;
}

/** GET /activity is cursor-paginated (apps/server's listActivitySchema), never OFFSET — useInfiniteQuery
    maps onto that directly: each page's own nextCursor becomes the next page's query param, and there's no
    "page number" anywhere, on either side. */
export function useActivityList(filters: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.actorId) params.set('actorId', filters.actorId);
      if (filters.action) params.set('action', filters.action);
      params.set('limit', String(PAGE_SIZE));
      if (pageParam) params.set('cursor', pageParam);
      return tenantSession.client.get<ActivityPage>(`/activity?${params.toString()}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
