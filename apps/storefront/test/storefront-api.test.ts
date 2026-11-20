import { describe, expect, it } from 'vitest';
import { STOREFRONT_CATALOGUE_LISTS_MAX } from '@lytronix/validators';
import type { ServerAnswer, ServerCall } from '../src/lib/api/server-api';
import {
  retryAfterSeconds,
  ShopBusy,
  StorefrontApi,
  type StorefrontShopContext,
} from '../src/lib/api/storefront-api';
import { StorefrontEnvironment } from '../src/lib/env';

const env = new StorefrontEnvironment({
  SERVER_URL: 'http://server:3000/',
  PLATFORM_DOMAIN: 'lytro.app',
  TRUSTED_EDGE_SECRET: 'edge-secret',
  STOREFRONT_SECRET: 'storefront-secret',
  CLIENT_IP_HEADER: 'CF-Connecting-IP',
});
const shop: StorefrontShopContext = {
  slug: 'megh',
  storefrontEnabled: true,
  key: 'lytro_pk_abc',
  origin: 'https://megh.lytro.app',
  mainHost: null,
  publicOrigin: 'https://megh.lytro.app',
};
// The edge's header as it reached the storefront: the server picks the shopper from it by its own hop rule.
const shopper = {
  host: 'megh.lytro.app',
  clientAddress: '103.10.20.30, 172.70.1.2',
  language: 'bn' as const,
  visitor: 'Vb3sQ0mX5n_kP7rT2yW9aA',
};

/** Records every call and answers each from the list given, in order. */
function server(...answers: ServerAnswer<unknown>[]) {
  const calls: ServerCall[] = [];
  return {
    calls,
    send: <T>(call: ServerCall): Promise<ServerAnswer<T>> => {
      calls.push(call);
      const answer = answers.shift() ?? { status: 500, data: null, code: null, details: {} };
      return Promise.resolve(answer as ServerAnswer<T>);
    },
  };
}
const ok = (data: unknown): ServerAnswer<unknown> => ({
  status: 200,
  data,
  code: null,
  details: {},
});

describe('StorefrontApi', () => {
  it("calls the public API as the shop, from the shopper's own address, with their mark (SFT-11, D14, RTE-06)", async () => {
    const fake = server(ok({ name: 'Megh' }));
    await new StorefrontApi(fake, env).shop(shop, shopper);
    expect(fake.calls[0]).toEqual({
      method: 'GET',
      path: '/v1/shop',
      host: 'api.lytro.app',
      headers: {
        'x-lytronix-edge-secret': 'edge-secret',
        'cf-connecting-ip': '103.10.20.30, 172.70.1.2',
        'x-lytro-storefront': 'storefront-secret',
        'x-lytro-visitor': 'Vb3sQ0mX5n_kP7rT2yW9aA',
        authorization: 'Bearer lytro_pk_abc',
        origin: 'https://megh.lytro.app',
        'accept-language': 'bn',
      },
      body: undefined,
    });
  });

  it("names no mark without the storefront's secret, since only that secret makes the server trust one", async () => {
    const fake = server(ok({ name: 'Megh' }));
    const edgeOnly = new StorefrontEnvironment({
      PLATFORM_DOMAIN: 'lytro.app',
      TRUSTED_EDGE_SECRET: 'edge-secret',
    });
    await new StorefrontApi(fake, edgeOnly).shop(shop, shopper);
    expect(fake.calls[0]?.headers).not.toHaveProperty('x-lytro-visitor');
    expect(fake.calls[0]?.headers).not.toHaveProperty('x-lytro-storefront');
  });

  it('passes no address without the edge secret, since the server would not trust it', async () => {
    const fake = server(ok({ name: 'Megh' }));
    await new StorefrontApi(fake, new StorefrontEnvironment({})).shop(shop, shopper);
    expect(fake.calls[0]?.headers).toEqual({
      authorization: 'Bearer lytro_pk_abc',
      origin: 'https://megh.lytro.app',
      'accept-language': 'bn',
    });
  });

  it("asks which shop a host serves with the storefront's secret, and keeps the answer 5 seconds (TEN-27)", async () => {
    const context = { outcome: 'open', shop };
    const fake = server(ok(context), ok(context));
    let now = 1_000;
    const api = new StorefrontApi(fake, env, () => now);
    expect(await api.context('Megh.Lytro.App')).toEqual(context);
    expect(fake.calls[0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/internal/storefront/context?host=megh.lytro.app',
      host: 'lytro.app',
      headers: {
        'x-lytronix-edge-secret': 'edge-secret',
        'x-lytro-storefront': 'storefront-secret',
      },
    });
    now += 4_000;
    await api.context('megh.lytro.app');
    expect(fake.calls).toHaveLength(1);
    now += 1_500;
    await api.context('megh.lytro.app');
    expect(fake.calls).toHaveLength(2);
  });

  it('asks once for a host however many pages ask at once, and asks again after a failed read (Slice 9.10)', async () => {
    const context = { outcome: 'open', shop };
    const failed = { status: 503, data: null, code: null, details: {} };
    const fake = server(ok(context), failed, ok(context));
    const api = new StorefrontApi(fake, env, () => 1_000);
    const answers = await Promise.all([1, 2, 3, 4, 5].map(() => api.context('megh.lytro.app')));
    expect(answers).toEqual([context, context, context, context, context]);
    expect(fake.calls).toHaveLength(1);
    // Another host's read fails; it isn't kept, so the next page asks again.
    await expect(api.context('rumana.lytro.app')).rejects.toThrow();
    expect(await api.context('rumana.lytro.app')).toEqual(context);
    expect(fake.calls).toHaveLength(3);
  });

  it('sends an order with its key, as the shop, and gives back the answer as it came (SFT-06)', async () => {
    const refused: ServerAnswer<unknown> = {
      status: 409,
      data: null,
      code: 'conflict',
      details: { reason: 'zone_no_delivery' },
    };
    const fake = server(refused);
    const body = { customerName: 'Rahima' };
    const answer = await new StorefrontApi(fake, env).placeOrder(shop, shopper, body, 'key-1');
    expect(answer).toEqual(refused);
    expect(fake.calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/orders',
      host: 'api.lytro.app',
      body,
      headers: { 'idempotency-key': 'key-1', authorization: 'Bearer lytro_pk_abc' },
    });
  });

  it('reads tracking as found, missing or too many looks (ORD-17)', async () => {
    const order = { trackingId: 'K7F2M9QX' };
    const none = { status: 404, data: null, code: 'not_found', details: {} };
    const busy = { status: 429, data: null, code: 'rate_limited', details: {} };
    const fake = server(ok(order), none, busy);
    const api = new StorefrontApi(fake, env);
    expect(await api.track(shop, shopper, 'K7F2M9QX')).toEqual({ kind: 'found', order });
    expect(await api.track(shop, shopper, 'NOPE')).toEqual({ kind: 'missing' });
    expect(await api.track(shop, shopper, 'K7F2M9QX')).toEqual({ kind: 'busy', retryAfter: 30 });
    expect(fake.calls[0]?.path).toBe('/v1/track/K7F2M9QX');
  });

  it('turns an old link into a redirect and an unknown one into missing (LND-03, LND-04)', async () => {
    const fake = server(ok({ slug: 'cotton-panjabi' }), ok({ slug: 'cotton-panjabi' }), {
      status: 404,
      data: null,
      code: 'not_found',
      details: {},
    });
    const api = new StorefrontApi(fake, env);
    expect(await api.product(shop, shopper, 'cotton-panjabi')).toMatchObject({ kind: 'found' });
    expect(await api.product(shop, shopper, 'old-panjabi')).toEqual({
      kind: 'moved',
      slug: 'cotton-panjabi',
    });
    expect(await api.product(shop, shopper, 'gone')).toEqual({ kind: 'missing' });
    expect(fake.calls[1]?.path).toBe('/v1/catalogue/products/old-panjabi');
  });

  it('answers null for items the server refuses, and fails loudly on anything else', async () => {
    const fake = server(
      { status: 422, data: null, code: 'validation_failed', details: {} },
      { status: 500, data: null, code: 'internal_error', details: {} },
    );
    const api = new StorefrontApi(fake, env);
    const body = { items: [{ variantId: 'v1', quantity: 1 }] };
    expect(await api.estimate(shop, shopper, body)).toBeNull();
    const failed = api.estimate(shop, shopper, body);
    await expect(failed).rejects.toThrow(/status 500/);
    await expect(failed).rejects.not.toBeInstanceOf(ShopBusy);
  });

  it('keeps the shop and its categories a minute per shop; a failed read is asked again (Slice 12b)', async () => {
    const failed = { status: 503, data: null, code: null, details: {} };
    const fake = server(
      failed,
      ok({ name: 'Megh' }),
      ok({ categories: [] }),
      ok({ name: 'Megh, renamed' }),
    );
    let now = 1_000;
    const api = new StorefrontApi(fake, env, () => now);
    await expect(api.shop(shop, shopper)).rejects.toThrow(/status 503/);
    expect(await api.shop(shop, shopper)).toEqual({ name: 'Megh' });
    expect(await api.categories(shop, shopper)).toEqual([]);
    now += 59_000;
    expect(await api.shop(shop, shopper)).toEqual({ name: 'Megh' });
    expect(await api.categories(shop, shopper)).toEqual([]);
    expect(fake.calls).toHaveLength(3);
    now += 2_000;
    expect(await api.shop(shop, shopper)).toEqual({ name: 'Megh, renamed' });
    expect(fake.calls.map((call) => call.path)).toEqual([
      '/v1/shop',
      '/v1/shop',
      '/v1/catalogue/categories',
      '/v1/shop',
    ]);
  });

  it("gives the edge's page a frame a few seconds old at most, and holds it for the pages after (Slice 9.10)", async () => {
    const fake = server(ok({ name: 'Megh' }), ok({ name: 'Megh, renamed' }));
    let now = 1_000;
    const api = new StorefrontApi(fake, env, () => now);
    expect(await api.shop(shop, shopper)).toEqual({ name: 'Megh' });
    // Within the 4 seconds the edge allows, its page takes the frame held.
    now += 3_000;
    expect(await api.shop(shop, { ...shopper, forEdge: true })).toEqual({ name: 'Megh' });
    expect(fake.calls).toHaveLength(1);
    // A purge comes 5 seconds after a change at the soonest: its page must not wear the frame from before it.
    now += 7_000;
    expect(await api.shop(shop, { ...shopper, forEdge: true })).toEqual({ name: 'Megh, renamed' });
    expect(await api.shop(shop, shopper)).toEqual({ name: 'Megh, renamed' });
    expect(fake.calls).toHaveLength(2);
  });

  it("asks for a list's category, search, order, stock and cursor; an unknown category is null (Slice 12b)", async () => {
    const page = { products: [], nextCursor: null };
    const fake = server(ok(page), ok(page), {
      status: 404,
      data: null,
      code: 'not_found',
      details: {},
    });
    const api = new StorefrontApi(fake, env);
    await api.products(shop, shopper, {
      cursor: 'abc',
      inStock: true,
      sort: 'price_low',
      search: 'lal panjabi',
      category: 'panjabi',
    });
    await api.products(shop, shopper, { inStock: false });
    expect(await api.products(shop, shopper, { category: 'hidden' })).toBeNull();
    expect(fake.calls.map((call) => call.path)).toEqual([
      '/v1/catalogue/products?category=panjabi&search=lal+panjabi&sort=price_low&inStock=true&cursor=abc',
      '/v1/catalogue/products',
      '/v1/catalogue/products?category=hidden',
    ]);
  });

  it('asks for a page’s lists in one call, as their query strings, a hidden category null (load fix 3)', async () => {
    const newest = { products: [], nextCursor: 'n1' };
    const sale = { products: [], nextCursor: null };
    const fake = server(ok({ lists: [{ page: newest }, { page: null }, { page: sale }] }));
    const pages = await new StorefrontApi(fake, env).productLists(shop, shopper, [
      { sort: 'newest', limit: 8 },
      { category: 'hidden' },
      { onSale: true, inStock: true },
    ]);
    expect(pages).toEqual([newest, null, sale]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/catalogue/lists',
      host: 'api.lytro.app',
      body: { queries: ['sort=newest&limit=8', 'category=hidden', 'inStock=true&onSale=true'] },
    });
    // The same shopper's mark and the storefront's secret as every catalogue read (RTE-06 as amended).
    expect(fake.calls[0]?.headers).toMatchObject({
      authorization: 'Bearer lytro_pk_abc',
      'x-lytro-storefront': 'storefront-secret',
      'x-lytro-visitor': shopper.visitor,
    });
  });

  it('splits more lists than one call takes into calls of the most it takes, in order (load fix 3)', async () => {
    const page = (cursor: string) => ({ products: [], nextCursor: cursor });
    const many = Array.from({ length: STOREFRONT_CATALOGUE_LISTS_MAX + 2 }, (_, index) => ({
      sort: 'newest' as const,
      limit: index + 1,
    }));
    const first = many.slice(0, STOREFRONT_CATALOGUE_LISTS_MAX);
    const fake = server(
      ok({ lists: first.map((_, index) => ({ page: page(`a${String(index)}`) })) }),
      ok({ lists: [{ page: page('b0') }, { page: page('b1') }] }),
    );
    const pages = await new StorefrontApi(fake, env).productLists(shop, shopper, many);
    expect(fake.calls.map((call) => (call.body as { queries: string[] }).queries.length)).toEqual([
      STOREFRONT_CATALOGUE_LISTS_MAX,
      2,
    ]);
    expect(pages.map((each) => each?.nextCursor)).toEqual([
      ...first.map((_, index) => `a${String(index)}`),
      'b0',
      'b1',
    ]);
  });

  it('shows the busy page when the server is too busy for a page’s lists (load fix 3, §7h)', async () => {
    const fake = server({
      status: 503,
      data: null,
      code: 'service_unavailable',
      details: {},
      retryAfter: '5',
    });
    const failed = new StorefrontApi(fake, env).productLists(shop, shopper, [{ sort: 'newest' }]);
    await expect(failed).rejects.toBeInstanceOf(ShopBusy);
  });
});

/** An answer the server gives when it is too busy, or broken, with the wait it names if any. */
const refused = (status: number, retryAfter?: string): ServerAnswer<unknown> => ({
  status,
  data: null,
  code: status === 429 ? 'rate_limited' : null,
  details: {},
  retryAfter: retryAfter ?? null,
});

/** What a call threw, so a test can say what kind of fault it was. */
async function thrown(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error('the call did not throw');
}

describe('a server too busy to answer (Slice 9.10, RTE-06)', () => {
  it("is a wait for 429 and 503, carrying the server's own wait", async () => {
    const api = new StorefrontApi(server(refused(429, '12'), refused(503, '45')), env);
    const many = await thrown(api.shop(shop, shopper));
    expect(many).toBeInstanceOf(ShopBusy);
    expect(many).toMatchObject({ status: 429, retryAfter: 12 });
    const busy = await thrown(api.locations(shop, shopper));
    expect(busy).toBeInstanceOf(ShopBusy);
    expect(busy).toMatchObject({ status: 503, retryAfter: 45 });
  });

  it('waits 30 seconds when the server names no wait', async () => {
    const api = new StorefrontApi(server(refused(429)), env);
    expect(await thrown(api.product(shop, shopper, 'cotton-panjabi'))).toMatchObject({
      status: 429,
      retryAfter: 30,
    });
  });

  it("is a short wait when the edge couldn't get a server process's answer (502, 504)", async () => {
    // Staging's live run (2026-11-19): a reused connection the API had just closed came back 502 through Caddy, and the
    // delivery charge answered 500.
    const api = new StorefrontApi(server(refused(502), refused(504)), env);
    expect(await thrown(api.shop(shop, shopper))).toMatchObject({ status: 503, retryAfter: 5 });
    const body = { items: [{ variantId: 'v1', quantity: 1 }] };
    const gateway = await thrown(api.estimate(shop, shopper, body));
    expect(gateway).toBeInstanceOf(ShopBusy);
    expect(gateway).toMatchObject({ status: 503, retryAfter: 5 });
  });

  it('stays a fault for 500 and 404, so a real fault still shows the error page', async () => {
    const api = new StorefrontApi(server(refused(500, '12'), refused(404)), env);
    const broken = await thrown(api.shop(shop, shopper));
    expect(broken).toBeInstanceOf(Error);
    expect(broken).not.toBeInstanceOf(ShopBusy);
    const missing = await thrown(api.categories(shop, shopper));
    expect(missing).not.toBeInstanceOf(ShopBusy);
    expect(missing).toMatchObject({ message: expect.stringMatching(/status 404/) as unknown });
  });

  it('is a wait when the server is too busy to name the shop a host serves', async () => {
    const api = new StorefrontApi(server(refused(503, '5'), refused(500)), env);
    expect(await thrown(api.context('megh.lytro.app'))).toMatchObject({
      status: 503,
      retryAfter: 5,
    });
    expect(await thrown(api.context('megh.lytro.app'))).not.toBeInstanceOf(ShopBusy);
  });

  it("is a wait for any page's list, product or estimate, but not for an order refused as paused", async () => {
    const paused: ServerAnswer<unknown> = {
      status: 503,
      data: null,
      code: 'service_unavailable',
      details: { savingPaused: true },
      retryAfter: '30',
    };
    const api = new StorefrontApi(server(refused(429), refused(503), paused), env);
    expect(await thrown(api.products(shop, shopper, {}))).toBeInstanceOf(ShopBusy);
    const body = { items: [{ variantId: 'v1', quantity: 1 }] };
    expect(await thrown(api.estimate(shop, shopper, body))).toBeInstanceOf(ShopBusy);
    // D9-14 (Slice 9.9): an order refused because orders can't be saved comes back as it came, for checkout to read.
    expect(await api.placeOrder(shop, shopper, {}, 'key-1')).toEqual(paused);
  });

  it("keeps the shop's last good read for a busy page, which a busy read never erases", async () => {
    let now = 1_000;
    const api = new StorefrontApi(server(ok({ name: 'Megh' }), refused(429)), env, () => now);
    expect(api.lastShop('megh')).toBeNull();
    await api.shop(shop, shopper);
    expect(api.lastShop('megh')).toEqual({ name: 'Megh' });
    // Past the minute the shop is kept, the next read is refused as too busy; the last good one stays for the busy page.
    now += 61_000;
    expect(await thrown(api.shop(shop, shopper))).toBeInstanceOf(ShopBusy);
    expect(api.lastShop('megh')).toEqual({ name: 'Megh' });
    expect(api.lastShop('another-shop')).toBeNull();
  });

  it('tells tracking how long too many looks wait', async () => {
    const api = new StorefrontApi(server(refused(429, '20')), env);
    expect(await api.track(shop, shopper, 'K7F2M9QX')).toEqual({ kind: 'busy', retryAfter: 20 });
  });
});

describe('retryAfterSeconds (Slice 9.10)', () => {
  it('reads whole seconds, at least one', () => {
    expect(retryAfterSeconds('12')).toBe(12);
    expect(retryAfterSeconds(' 7 ')).toBe(7);
    expect(retryAfterSeconds('0')).toBe(1);
  });

  it('is 30 seconds when the header is missing or names no whole seconds', () => {
    expect(retryAfterSeconds(null)).toBe(30);
    expect(retryAfterSeconds(undefined)).toBe(30);
    expect(retryAfterSeconds('')).toBe(30);
    expect(retryAfterSeconds('-3')).toBe(30);
    expect(retryAfterSeconds('1.5')).toBe(30);
    expect(retryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(30);
  });
});
