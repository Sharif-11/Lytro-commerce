import { EDGE_TAG_EVERY, listingEdgeTag, productEdgeTag, shopEdgeTag } from '@lytronix/validators';

/** Slice 9.10, D9-32: the tags the server's purges name a shop's page by (packages/validators): every page, the
    shop's, `listing` for a page that lists products (a new one may join it), and each product it shows, so a price or
    stock change of any of them clears it. */
export function shopPageTags(
  slug: string,
  shows: { listing?: boolean; products?: readonly { id: string }[] },
): string[] {
  return [
    EDGE_TAG_EVERY,
    shopEdgeTag(slug),
    ...(shows.listing === true ? [listingEdgeTag(slug)] : []),
    ...new Set((shows.products ?? []).map((product) => productEdgeTag(product.id))),
  ];
}
