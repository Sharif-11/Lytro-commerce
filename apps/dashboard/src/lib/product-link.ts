import type { ProductDetail } from '@/types/product';

/** LND-06: a product's landing link, and the same with a variant chosen, by the variant's id as the feed's links are. */
export function linkOf(
  host: string,
  product: Pick<ProductDetail, 'slug'>,
  variantId: string | null,
): string {
  return `${host}/l/${product.slug}${variantId ? `?v=${variantId}` : ''}`;
}
