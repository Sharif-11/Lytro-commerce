import { deliveryEstimateSchema } from '@lytronix/validators';
import { withBusyAnswer } from '@/lib/busy-route';
import { EDGE_LIFETIMES, edgeHeaders } from '@/lib/edge/edge-cache';
import { shopPageTags } from '@/lib/edge/edge-tags';
import { readEstimateQuery } from '@/lib/product/estimate-query';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// SFT-20, LND-08: the page's delivery charge, asked by the shopper's browser of the storefront's own server, which
// holds the shop's key (SFT-11) and passes the shopper's address on. A busy server's refusal comes back as it came
// (Slice 9.10), so the page says the charge can't be shown right now.
export const dynamic = 'force-dynamic';

/** Slice 9.10, D9-32: one product's charge, the same for every shopper, which Cloudflare's edge keeps
    for five minutes, cleared with the shop's or the product's pages. Browsers keep nothing. */
export const GET = withBusyAnswer(async (request: Request): Promise<Response> => {
  const page = await loadShopPage();
  if (page.state !== 'open') return Response.json(null, { status: 404 });
  const query = readEstimateQuery(new URL(request.url).searchParams);
  if (query === null) return Response.json(null, { status: 400 });
  const parsed = deliveryEstimateSchema.safeParse({
    items: [{ variantId: query.variantId, quantity: query.quantity }],
    ...(query.areaId === null ? {} : { locationId: query.areaId }),
  });
  if (!parsed.success) return Response.json(null, { status: 400 });
  const estimate = await storefrontApi.estimate(page.shop, page.shopper, parsed.data);
  return Response.json(estimate, {
    headers: {
      'cache-control': 'no-store',
      ...edgeHeaders(
        EDGE_LIFETIMES.page,
        shopPageTags(page.shop.slug, { products: [{ id: query.productId }] }),
      ),
    },
  });
});

/** A cart's charge, or a page's with add-ons: one shopper's, kept nowhere. */
export const POST = withBusyAnswer(async (request: Request): Promise<Response> => {
  const page = await loadShopPage();
  if (page.state !== 'open') return Response.json(null, { status: 404 });
  const parsed = deliveryEstimateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json(null, { status: 400 });
  const estimate = await storefrontApi.estimate(page.shop, page.shopper, parsed.data);
  return Response.json(estimate, { headers: { 'cache-control': 'no-store' } });
});
