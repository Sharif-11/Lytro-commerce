import { cookies } from 'next/headers';
import type { ShopperSignedIn } from '@/lib/api/storefront-api';
import { SHOPPER_COOKIE, shopperCookieOptions } from '@/lib/account/shopper-cookie';
import { loadShopPage, shopperToken, storefrontApi } from '@/lib/storefront';

// CUS-03 to CUS-06, ORD-18 (Slice 4.8e, part 2): a shopper's account, asked by their browser of the storefront's own server,
// which holds the shop's key (SFT-11) and the shopper's sign-in in an http-only cookie, so neither reaches a script. Only
// the calls the pages make pass. Signing in sets the cookie and keeps the token out of the answer; a token the server no
// longer takes clears it. A switched-off storefront has no account (SFT-16). Never kept by any cache (CCH-07).
export const dynamic = 'force-dynamic';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const ALLOWED: Readonly<Record<Method, RegExp>> = {
  GET: /^orders$/,
  POST: /^(code|signup|signin|signout|password|addresses)$/,
  PATCH: /^(me|addresses\/[0-9a-f-]{36})$/,
  DELETE: /^addresses\/[0-9a-f-]{36}$/,
};

const noStore = { 'cache-control': 'no-store' };

async function pass(
  method: Method,
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const page = await loadShopPage();
  if (page.state !== 'open' || !page.shop.storefrontEnabled) {
    return Response.json({ code: 'not_found' }, { status: 404, headers: noStore });
  }
  const path = (await params).path.join('/');
  if (!ALLOWED[method].test(path)) {
    return Response.json({ code: 'not_found' }, { status: 404, headers: noStore });
  }
  const body: unknown =
    method === 'POST' || method === 'PATCH' ? await request.json().catch(() => ({})) : undefined;
  const query = new URL(request.url).search;
  const jar = await cookies();
  try {
    const answer = await storefrontApi.shopperCall<ShopperSignedIn>(
      page.shop,
      page.shopper,
      method,
      `${path}${query}`,
      await shopperToken(),
      body,
    );
    if (answer.data && (path === 'signin' || path === 'signup')) {
      jar.set(
        SHOPPER_COOKIE,
        answer.data.token,
        shopperCookieOptions(page.shopper.host, answer.data.expiresAt),
      );
      return Response.json(
        { data: { shopper: answer.data.shopper } },
        { status: answer.status, headers: noStore },
      );
    }
    if (path === 'signout' || answer.status === 401) jar.delete(SHOPPER_COOKIE);
    return Response.json(
      { data: answer.data, code: answer.code, details: answer.details },
      { status: answer.status, headers: noStore },
    );
  } catch {
    return Response.json({ code: 'unavailable' }, { status: 503, headers: noStore });
  }
}

type Context = { params: Promise<{ path: string[] }> };

export const GET = (request: Request, context: Context) => pass('GET', request, context);
export const POST = (request: Request, context: Context) => pass('POST', request, context);
export const PATCH = (request: Request, context: Context) => pass('PATCH', request, context);
export const DELETE = (request: Request, context: Context) => pass('DELETE', request, context);
