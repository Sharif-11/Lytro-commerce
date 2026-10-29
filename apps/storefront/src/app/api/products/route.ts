import { publicProductListSchema } from '@lytronix/validators';
import { loadShopPage, storefrontApi } from '@/lib/storefront';

// CCH-11: a list's next page, asked by the shopper's browser ("Show more") of the storefront's own server, which holds
// the shop's key (SFT-11) and passes the shopper's address on. One counted call each.
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) {
    return Response.json(null, { status: 404 });
  }
  const parsed = publicProductListSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return Response.json(null, { status: 400 });
  const { category, search, sort, inStock, cursor, limit } = parsed.data;
  const list = await storefrontApi.products(page.shop, page.shopper, {
    category,
    search,
    sort,
    inStock,
    cursor,
    limit,
  });
  if (list === null) return Response.json(null, { status: 404 });
  return Response.json(list, { headers: { 'cache-control': 'private, max-age=30' } });
}
