import { publicProductListSchema } from '@lytronix/validators';
import { withBusyAnswer } from '@/lib/busy-route';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// CCH-11: a list's next page, asked by the shopper's browser ("Show more") of the storefront's own server, which holds
// the shop's key (SFT-11) and passes the shopper's address on. One counted call each. A busy server's refusal comes back
// as it came (Slice 9.10), so the list says so under itself.
export const dynamic = 'force-dynamic';

export const GET = withBusyAnswer(async (request: Request): Promise<Response> => {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) {
    return Response.json(null, { status: 404 });
  }
  const parsed = publicProductListSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return Response.json(null, { status: 400 });
  const { category, search, sort, inStock, onSale, cursor, limit } = parsed.data;
  const list = await storefrontApi.products(page.shop, page.shopper, {
    category,
    search,
    sort,
    inStock,
    // STOREFRONT-BUILDER-PLAN SB-9: /offers' next page lists only what is on sale, as its first did.
    onSale,
    cursor,
    limit,
  });
  if (list === null) return Response.json(null, { status: 404 });
  return Response.json(list, { headers: { 'cache-control': 'private, max-age=30' } });
});
