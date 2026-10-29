import { cookies } from 'next/headers';
import type { DeliveryEstimate, PublicCategory, PublicProduct } from '../api/storefront-api';
import { AREA_COOKIE, parseArea } from '../area';
import { type ShopPage, storefrontApi } from '../storefront';
import { VariantChoice } from './variant-choice';

type OpenShop = Extract<ShopPage, { state: 'open' }>;

/** What a product or landing page opens with, worked out on the server so the first paint is already right: the
    variant a `?v=` link names (LND-06), the shopper's remembered area, and the delivery charge for the two (SFT-20). */
export async function productOpening(
  page: OpenShop,
  product: PublicProduct,
  v: string | string[] | undefined,
): Promise<{
  linkedVariantId: string | null;
  areaId: number | null;
  estimate: DeliveryEstimate | null;
}> {
  const linkedVariantId = typeof v === 'string' && v.length > 0 ? v : null;
  const areaId = parseArea((await cookies()).get(AREA_COOKIE)?.value);
  const choice = new VariantChoice(product.options, product.variants);
  const variant = choice.variantFor(choice.initial(linkedVariantId));
  const estimate = variant
    ? await storefrontApi
        .estimate(page.shop, page.shopper, {
          items: [{ variantId: variant.id, quantity: 1 }],
          ...(areaId === null ? {} : { locationId: areaId }),
        })
        .catch(() => null)
    : null;
  return { linkedVariantId, areaId, estimate };
}

/** A category's name by id, anywhere in the tree. */
export function categoryName(tree: PublicCategory[], id: string | null): string | null {
  if (id === null) return null;
  for (const category of tree) {
    if (category.id === id) return category.name;
    const inside = categoryName(category.children, id);
    if (inside !== null) return inside;
  }
  return null;
}

/** The query string a moved link keeps (`?v=`), so the redirect lands on the same variant. */
export function keptQuery(v: string | string[] | undefined): string {
  return typeof v === 'string' && v.length > 0 ? `?v=${encodeURIComponent(v)}` : '';
}
