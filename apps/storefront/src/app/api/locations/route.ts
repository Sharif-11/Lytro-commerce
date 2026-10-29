import { loadShopPage, storefrontApi } from '@/lib/storefront';

// CUS-08: the canonical zillas and thanas for the area picker and the order form, through the shop's key (SFT-11).
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const page = await loadShopPage();
  if (page.state !== 'open') return Response.json(null, { status: 404 });
  const locations = await storefrontApi.locations(page.shop, page.shopper);
  // The list changes only with a platform release, so the shopper's browser may keep it for the day.
  return Response.json(locations, { headers: { 'cache-control': 'private, max-age=86400' } });
}
