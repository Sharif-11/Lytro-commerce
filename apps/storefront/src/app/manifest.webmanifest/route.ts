import { storefrontManifest } from '@/lib/app/app-manifest';
import { loadShopPage } from '@/lib/storefront';

// SFT-14 (Slice 12c): the storefront's own app manifest -- the shop's plain name and icon, scoped to the whole
// storefront -- for a shop whose storefront is open and on. Kept a minute, so a new name, logo or identity reaches the
// next install within BRN-02's minute.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) {
    return Response.json(null, { status: 404 });
  }
  return new Response(JSON.stringify(storefrontManifest(page.info)), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
