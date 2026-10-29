import { cookies } from 'next/headers';
import type { DeliveryEstimate, PublicProduct } from '../api/storefront-api';
import { AREA_COOKIE, parseArea } from '../area';
import { type OpenShopPage, storefrontApi } from '../storefront';
import { VariantChoice } from './variant-choice';

/** What a product or landing page opens with, worked out on the server so the first paint is already right: the
    variant a `?v=` link names (LND-06), the shopper's remembered area, and the delivery charge for the two when
    that variant can be bought (SFT-20). */
export async function productOpening(
  page: OpenShopPage,
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
  const estimate = variant?.available
    ? await storefrontApi
        .estimate(page.shop, page.shopper, {
          items: [{ variantId: variant.id, quantity: 1 }],
          ...(areaId === null ? {} : { locationId: areaId }),
        })
        .catch(() => null)
    : null;
  return { linkedVariantId, areaId, estimate };
}

/** The query string a moved link keeps (`?v=`), so the redirect lands on the same variant. */
export function keptQuery(v: string | string[] | undefined): string {
  return typeof v === 'string' && v.length > 0 ? `?v=${encodeURIComponent(v)}` : '';
}
