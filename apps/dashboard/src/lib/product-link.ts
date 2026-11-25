import type { ProductDetail } from '@/types/product';

/**
 * LND-06: a product's landing link, and the same with a variant chosen, by the variant's id as the feed's links are.
 * The owner, 2026-11-25: the link names the product by its ID, never its slug (a Bangla name made a very long link); a
 * link shared by its slug before still opens, led to this one.
 */
export function linkOf(
  host: string,
  product: Pick<ProductDetail, 'id'>,
  variantId: string | null,
): string {
  return `${host}/l/${product.id}${variantId ? `?v=${variantId}` : ''}`;
}
