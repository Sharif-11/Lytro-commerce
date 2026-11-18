import { EDGE_MARK_NAME, type EdgeMark as Mark, edgeMarkContent } from '@/lib/edge/edge-cache';
import { shopPageTags } from '@/lib/edge/edge-tags';
import type { OpenShopPage } from '@/lib/storefront';

// Slice 9.10, D9-32: what a page rendered for Cloudflare's edge tells the middleware (lib/edge): the tags the server's
// purges name it by, or that it can't be kept while orders can't be saved (D9-14), since that line is for now only. A
// page rendered for one shopper shows no mark.
export function EdgeMark({
  page,
  listing,
  products,
  keepPrivate,
}: {
  page: OpenShopPage;
  listing?: boolean;
  products?: readonly { id: string }[];
  /** STOREFRONT-BUILDER-PLAN SB-12: a page for one person (a draft's preview), never kept for anyone else. */
  keepPrivate?: boolean;
}) {
  if (page.shopper.forEdge !== true) return null;
  const mark: Mark =
    page.savingPaused || keepPrivate === true
      ? { kind: 'private' }
      : {
          kind: 'tags',
          tags: shopPageTags(page.shop.slug, {
            ...(listing === undefined ? {} : { listing }),
            ...(products === undefined ? {} : { products }),
          }),
        };
  return <meta name={EDGE_MARK_NAME} content={edgeMarkContent(mark)} />;
}
