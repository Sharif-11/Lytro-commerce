import { deliveryEstimateSchema } from '@lytronix/validators';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// SFT-20, LND-08: the page's delivery charge, asked by the shopper's browser of the storefront's own server, which
// holds the shop's key (SFT-11) and passes the shopper's address on. Never kept by any cache (CCH-07).
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const page = await loadShopPage();
  if (page.state !== 'open') return Response.json(null, { status: 404 });
  const parsed = deliveryEstimateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json(null, { status: 400 });
  const estimate = await storefrontApi.estimate(page.shop, page.shopper, parsed.data);
  return Response.json(estimate, { headers: { 'cache-control': 'no-store' } });
}
