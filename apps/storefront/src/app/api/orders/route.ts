import { loadShopPage, storefrontApi } from '@/lib/storefront';

// SFT-06, LND-09, SFT-11: a shopper's order, sent by their browser to the storefront's own server, which holds the shop's
// key and passes the shopper's address on. The server checks everything (ORD-02) and its answer comes back as it is, so
// the page can say what a refusal means. Never kept by any cache (CCH-07).
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

export async function POST(request: Request): Promise<Response> {
  const page = await loadShopPage();
  if (page.state !== 'open') return Response.json({ code: 'not_found' }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  const key = request.headers.get('idempotency-key');
  if (body === null || typeof body !== 'object' || !key) {
    return Response.json({ code: 'validation_error' }, { status: 400 });
  }
  // SFT-16, LND-02: a switched-off storefront takes no checkout; its landing pages keep taking orders.
  if (!page.shop.storefrontEnabled && (body as { source?: unknown }).source !== 'landing_page') {
    return Response.json({ code: 'not_found' }, { status: 404 });
  }
  // SFT-07, PAY-04: an advance's return address, on the shop's own address, the one its key names. A shop on its own domain
  // is led there from this address (Slice 13); the page says which order it was, as it can't be known yet.
  const { payment } = body as { payment?: { method?: unknown } };
  const sent = payment
    ? { ...body, payment: { ...payment, returnUrl: `${page.shop.origin}/order/return` } }
    : body;
  try {
    const answer = await storefrontApi.placeOrder(page.shop, page.shopper, sent, key);
    return Response.json(
      { data: answer.data, code: answer.code, details: answer.details },
      { status: answer.status, headers: noStore },
    );
  } catch {
    // The server did not answer, so the order may or may not have reached it: the page tries again with the same key.
    return Response.json({ code: 'unavailable' }, { status: 503, headers: noStore });
  }
}
