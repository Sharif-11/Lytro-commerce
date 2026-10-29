import { describe, expect, it } from 'vitest';
import type { ServerAnswer, ServerCall } from '../src/lib/api/server-api';
import { StorefrontApi, type StorefrontShopContext } from '../src/lib/api/storefront-api';
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
};
// The edge's header as it reached the storefront: the server picks the shopper from it by its own hop rule.
const shopper = {
  host: 'megh.lytro.app',
  clientAddress: '103.10.20.30, 172.70.1.2',
  language: 'bn' as const,
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
  it("calls the public API as the shop, from the shopper's own address (SFT-11, D14)", async () => {
    const fake = server(ok({ name: 'Megh' }));
    await new StorefrontApi(fake, env).shop(shop, shopper);
    expect(fake.calls[0]).toEqual({
      method: 'GET',
      path: '/v1/shop',
      host: 'api.lytro.app',
      headers: {
        'x-lytronix-edge-secret': 'edge-secret',
        'cf-connecting-ip': '103.10.20.30, 172.70.1.2',
        authorization: 'Bearer lytro_pk_abc',
        origin: 'https://megh.lytro.app',
        'accept-language': 'bn',
      },
      body: undefined,
    });
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

  it("asks which shop a host serves with the storefront's secret, and keeps the answer half a minute", async () => {
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
    now += 29_000;
    await api.context('megh.lytro.app');
    expect(fake.calls).toHaveLength(1);
    now += 2_000;
    await api.context('megh.lytro.app');
    expect(fake.calls).toHaveLength(2);
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
      { status: 503, data: null, code: null, details: {} },
    );
    const api = new StorefrontApi(fake, env);
    const body = { items: [{ variantId: 'v1', quantity: 1 }] };
    expect(await api.estimate(shop, shopper, body)).toBeNull();
    await expect(api.estimate(shop, shopper, body)).rejects.toThrow(/status 503/);
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
});
