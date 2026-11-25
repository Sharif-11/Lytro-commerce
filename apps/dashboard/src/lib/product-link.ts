import type { ProductDetail } from '@/types/product';

/**
 * LND-06: a product's landing link on the shop's own address, the one builder of it -- and, with one of its photo
 * designs chosen (DC-3, TENANT-DASHBOARD-DESIGN §7.4c, the owner 2026-11-25), opening with that design (`?d=`, as the
 * storefront's design cards link).
 */
export function linkOf(
  host: string,
  product: Pick<ProductDetail, 'slug'>,
  designId: string | null = null,
): string {
  return `${host}/l/${product.slug}${designId ? `?d=${designId}` : ''}`;
}
