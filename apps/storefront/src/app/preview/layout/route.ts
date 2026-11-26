import { previewLayoutQuerySchema } from '@lytronix/validators';
import { loadHome } from '@/components/home/home-view';
import { withBusyAnswer } from '@/lib/busy-route';
import { DashboardOrigin } from '@/lib/design/dashboard-origin';
import { leftOut } from '@/lib/design/left-out';
import { StorefrontEnvironment } from '@/lib/env';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// STOREFRONT-BUILDER-PLAN SB-32 as amended (the owner, 2026-11-26, sketch `de-*`): what the home drawn from the draft
// leaves out -- the rows short of their fill, and the seller's own slides and banners whose link leads where nothing is
// now -- for the design editor's notes. Opened as /preview is, with its short-lived signed link, and answered from the
// very reads and code that draw that preview (`loadHome`, `homeLayout`, `linkShows`), so the editor never guesses. Never
// kept anywhere; readable from a browser only by the dashboard.
export const dynamic = 'force-dynamic';

const origins = new DashboardOrigin(StorefrontEnvironment.shared().platformDomain);

const answer = withBusyAnswer(async (request: Request): Promise<Response> => {
  const parsed = previewLayoutQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return Response.json(null, { status: 400 });
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) {
    return Response.json(null, { status: 404 });
  }
  // An ended, changed or another shop's link: the preview says so, and this answers nothing.
  const info = await storefrontApi.shopPreview(page.shop, page.shopper, parsed.data.t);
  if (!info?.design) return Response.json(null, { status: 404 });
  const home = await loadHome({ ...page, info });
  if (!home.designed) return Response.json(null, { status: 404 });
  return Response.json(
    leftOut(info.design, home.designed.rows, {
      categories: home.frame.categories,
      sale: info.sale ?? { products: 0 },
      productCount: info.productCount,
    }),
  );
});

export async function GET(request: Request): Promise<Response> {
  const answered = await answer(request);
  const headers = new Headers(answered.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-robots-tag', 'noindex');
  for (const [name, value] of Object.entries(origins.headersFor(request.headers.get('origin')))) {
    headers.set(name, value);
  }
  return new Response(answered.body, { status: answered.status, headers });
}
