import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { HomeView } from '@/types/home';

export const HOME_QUERY_KEY = ['home'] as const;

/**
 * GET /home: Home's figures in one read (TENANT-DASHBOARD-DESIGN §7.1). The shell reads the stock counts for the
 * Shop tab's pill and the side column; React Query reads it again when the person comes back to the tab.
 */
export function useHome(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: HOME_QUERY_KEY,
    queryFn: () => tenantSession.client.get<HomeView>('/home'),
    enabled: options.enabled ?? true,
  });
}

/** POST /home/link-shared: the shop's link was copied or shared from the dashboard, ticking SUP-01 on every device. */
export function useMarkLinkShared() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/home/link-shared'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    },
  });
}
