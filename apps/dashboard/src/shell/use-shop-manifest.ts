import { useEffect } from 'react';
import { pointLink } from './head-tags';

/**
 * TEN-17 (KNOWN-GAPS §88): each shop's pages link that shop's own manifest and iPhone icon, so installing from
 * `/<shop>/` gives the shop's own app -- its name, its logo or monogram, its path. Pages outside a shop link none,
 * and offer no install.
 */
export function useShopManifest(slug: string): void {
  useEffect(() => {
    const undoManifest = pointLink('manifest', `/api/v1/shops/${slug}/manifest.webmanifest`);
    const undoIcon = pointLink('apple-touch-icon', `/api/v1/shops/${slug}/icons/apple-180.png`);
    return () => {
      undoManifest();
      undoIcon();
    };
  }, [slug]);
}
