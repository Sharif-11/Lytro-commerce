import { withBusyAnswer } from '@/lib/busy-route';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// CUS-08: the canonical zillas and thanas for the area picker and the order form, through the shop's key (SFT-11). A
// busy server's refusal comes back as it came (Slice 9.10), and is never kept, so the next ask goes to the server again.
export const dynamic = 'force-dynamic';

export const GET = withBusyAnswer(async (): Promise<Response> => {
  const page = await loadShopPage();
  if (page.state !== 'open') return Response.json(null, { status: 404 });
  const locations = await storefrontApi.locations(page.shop, page.shopper);
  // The list changes only with a platform release, so the shopper's browser may keep it for the day.
  return Response.json(locations, { headers: { 'cache-control': 'private, max-age=86400' } });
});
