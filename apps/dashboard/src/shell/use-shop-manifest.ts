import { useEffect } from 'react';

/** Points the page's `<link rel>` of this kind at a URL, creating it when the page has none; returns the undo. */
function pointLink(rel: string, href: string): () => void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const created = !link;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  const before = link.getAttribute('href');
  link.href = href;
  return () => {
    if (created) link.remove();
    else if (before !== null) link.setAttribute('href', before);
  };
}

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
