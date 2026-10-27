import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateAdTrackingInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { AdTracking, CatalogFeed } from '@/types/meta';

export const AD_TRACKING_QUERY_KEY = ['ad-tracking'] as const;
export const CATALOG_FEED_QUERY_KEY = ['catalog-feed'] as const;

/** LND-17: the Meta Pixel ID, and whether a Conversions API token is set. */
export function useAdTracking() {
  return useQuery({
    queryKey: AD_TRACKING_QUERY_KEY,
    queryFn: () => tenantSession.client.get<AdTracking>('/ad-tracking'),
  });
}

/** LND-15 to LND-17: the pixel (null disconnects it) and the token (left out keeps it, null removes it). */
export function useSaveAdTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAdTrackingInput) =>
      tenantSession.client.put<AdTracking>('/ad-tracking', input),
    onSuccess: (data) => {
      queryClient.setQueryData(AD_TRACKING_QUERY_KEY, data);
    },
  });
}

/** FED-01: the shop's catalog feed link. */
export function useCatalogFeed() {
  return useQuery({
    queryKey: CATALOG_FEED_QUERY_KEY,
    queryFn: () => tenantSession.client.get<CatalogFeed>('/catalog-feed'),
  });
}

/** FED-05: a new feed link; the old one stops working at once. */
export function useRegenerateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantSession.client.post<CatalogFeed>('/catalog-feed/regenerate'),
    onSuccess: (data) => {
      queryClient.setQueryData(CATALOG_FEED_QUERY_KEY, data);
    },
  });
}
