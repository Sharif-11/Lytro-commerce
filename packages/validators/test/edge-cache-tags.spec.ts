import { describe, expect, it } from 'vitest';
import {
  EDGE_TAG_EVERY,
  listingEdgeTag,
  productEdgeTag,
  shopEdgeTag,
} from '../src/edge-cache-tags';

// D9-32: the storefront tags a page and the server purges it by the same names.
describe("the edge cache's tags", () => {
  it('names every page, a shop, its listings and a product', () => {
    expect(EDGE_TAG_EVERY).toBe('lytro');
    expect(shopEdgeTag('faiza-shoes')).toBe('s:faiza-shoes');
    expect(listingEdgeTag('faiza-shoes')).toBe('l:faiza-shoes');
    expect(productEdgeTag('4c61402a-8ddb-4f39-b625-dd7f066e1b44')).toBe(
      'p:4c61402a-8ddb-4f39-b625-dd7f066e1b44',
    );
  });

  it('keeps each tag printable ASCII, as Cloudflare requires', () => {
    for (const tag of [shopEdgeTag('a-1'), listingEdgeTag('a-1'), productEdgeTag('0f-9')]) {
      expect(tag).toMatch(/^[\x21-\x7e]+$/);
    }
  });
});
