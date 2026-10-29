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
const shopper = { host: 'megh.lytro.app', ip: '103.10.20.30', language: 'bn' as const };

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
        'cf-connecting-ip': '103.10.20.30',
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
});
