import { cookies } from 'next/headers';
import type { DeliveryEstimate, PublicProduct } from '../api/storefront-api';
import { AREA_COOKIE, parseArea } from '../area';
import { type OpenShopPage, storefrontApi } from '../storefront';
import { VariantChoice } from './variant-choice';

/** What a product or landing page opens with, worked out on the server so the first paint is already right: the
    variant a `?v=` link names (LND-06), the shopper's remembered area, and the delivery charge for the two when
    that variant can be bought (SFT-20). A page for Cloudflare's edge (Slice 9.10, D9-32) is the same for every
    shopper, so it opens on the product's own first choice and no area, and the browser applies the link and the area
    after its first paint (`openInBrowser`). */
export async function productOpening(
  page: OpenShopPage,
  product: PublicProduct,
  v: string | string[] | undefined,
): Promise<{
  linkedVariantId: string | null;
  areaId: number | null;
  estimate: DeliveryEstimate | null;
  openInBrowser: boolean;
}> {
  const openInBrowser = page.shopper.forEdge === true;
  const linkedVariantId = !openInBrowser && typeof v === 'string' && v.length > 0 ? v : null;
  const areaId = openInBrowser ? null : parseArea((await cookies()).get(AREA_COOKIE)?.value);
  const choice = new VariantChoice(product.options, product.variants);
  const variant = choice.variantFor(choice.initial(linkedVariantId));
  const estimate = variant?.available
    ? await storefrontApi
        .estimate(page.shop, page.shopper, {
          // The add-ons a page opens with are the defaults an estimate naming none takes.
          items: [{ variantId: variant.id, quantity: 1 }],
          ...(areaId === null ? {} : { locationId: areaId }),
        })
        .catch(() => null)
    : null;
  return { linkedVariantId, areaId, estimate, openInBrowser };
}
