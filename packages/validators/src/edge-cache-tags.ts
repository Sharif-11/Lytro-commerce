// D9-32 (Slice 9.10): the tags Cloudflare keeps a shop's cached pages under, and the server purges them by. The storefront
// writes them on each page it lets Cloudflare keep; the server names the same ones when what a page shows changes. One
// definition for both, so a page is always tagged as its purge names it. Printable ASCII only (Cloudflare's rule): a slug
// is a host label and a product id a UUID.

/** Every page Cloudflare keeps, for a change that reaches every shop (the platform's attribute library). */
export const EDGE_TAG_EVERY = 'lytro';

/** Every kept page of one shop: its name, logo, colours, categories, zones, or its state changed. */
export function shopEdgeTag(slug: string): string {
  return `s:${slug}`;
}

/** A shop's listing pages (home, categories, new, search): which products they list changed. */
export function listingEdgeTag(slug: string): string {
  return `l:${slug}`;
}

/** Every kept page showing one product (its page, its landing pages, its card anywhere, its delivery estimates). */
export function productEdgeTag(productId: string): string {
  return `p:${productId}`;
}
