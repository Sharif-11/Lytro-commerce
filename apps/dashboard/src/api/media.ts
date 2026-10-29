import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@lytronix/api-client';
import { tenantSession } from '@/session/tenant-session';
import type { MediaDetail, MediaUses, StorageUsage } from '@/types/media';

export const STORAGE_QUERY_KEY = ['media', 'usage'] as const;

/**
 * GET /media/usage (STO-01, STO-04, STO-05): the storage used against the shop's limit, and the largest image and video
 * one upload may be.
 */
export function useStorageUsage(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: STORAGE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<StorageUsage>('/media/usage'),
    enabled: options.enabled ?? true,
  });
}

/**
 * MED-09: whether anything shows the item still -- a product, a video, a category, a swatch, a size chart, the logo,
 * the brand identity's images (KNOWN-GAPS §97).
 */
export function inUse(uses: MediaUses): boolean {
  return (
    uses.logo ||
    uses.brand ||
    uses.products + uses.videos + uses.categories + uses.swatches + uses.sizeCharts > 0
  );
}

/**
 * PRD-11, agreed 2026-10-27: items a product let go of, deleted when nothing else shows them, so storage frees; a copy
 * that shares a photo keeps it (PRD-18). Past orders do not hold one back: they show a placeholder (MED-09). A failure
 * leaves the item in the shop's media, where it does no harm.
 */
export class UnusedMedia {
  constructor(private readonly client: ApiClient) {}

  async forget(ids: Iterable<string>): Promise<void> {
    for (const id of new Set(ids)) {
      try {
        const detail = await this.client.get<MediaDetail>(`/media/${id}`);
        if (!inUse(detail.uses)) await this.client.delete(`/media/${id}`);
      } catch {
        // Kept: it can be deleted another time.
      }
    }
  }
}

export const unusedMedia = new UnusedMedia(tenantSession.client);
