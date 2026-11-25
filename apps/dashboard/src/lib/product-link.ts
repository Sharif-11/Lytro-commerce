import type { ProductDetail } from '@/types/product';

/** LND-06: a product's landing link, and the same with a variant chosen, by the variant's id as the feed's links are. */
export function linkOf(
  host: string,
  product: Pick<ProductDetail, 'slug'>,
  variantId: string | null,
): string {
  return `${host}/l/${product.slug}${variantId ? `?v=${variantId}` : ''}`;
}

/**
 * DC-3 (TENANT-DASHBOARD-DESIGN §7.4c, the owner 2026-11-25): a product's landing link opening with one of its photo
 * designs chosen (`?d=`, as the storefront's design cards link), or the whole product's without one.
 */
export function designLinkOf(
  host: string,
  product: Pick<ProductDetail, 'slug'>,
  designId: string | null,
): string {
  return `${host}/l/${product.slug}${designId ? `?d=${designId}` : ''}`;
}
