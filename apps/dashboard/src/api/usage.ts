import { useQuery } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { ShopUsage } from '@/types/usage';

export const USAGE_QUERY_KEY = ['usage'] as const;

/** LIM-02: every metric against the shop's limits, its cycle, the daily figures and what would give room. */
export function useUsage(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ShopUsage>('/usage'),
    enabled: options.enabled ?? true,
  });
}
