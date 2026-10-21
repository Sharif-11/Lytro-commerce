import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { MEDIA_BLOCKED_KEY, mediaOriginsKey } from '@lytronix/shared-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { EdgeState } from '../src/edge-state';
import { MediaHandler } from '../src/handler';
import { LinkVerifier } from '../src/signed-link';
import { FakeOrigin, FakeUsage, OTHER_SHOP, SHOP, bytesOf, digest, signedQuery } from './fakes';

const BASE = 'https://media.lytro.test';
const DASHBOARD = 'https://app.lytro.test';
const SHOP_SITE = 'https://myshop.com';
const KEY = `tenants/${SHOP}/m1/abc.webp`;
const MB = 1024 * 1024;

let origin: FakeOrigin;
let usage: FakeUsage;
let handler: MediaHandler;

beforeEach(async () => {
  origin = new FakeOrigin();
  usage = new FakeUsage();
  await env.MEDIA_EDGE.delete(MEDIA_BLOCKED_KEY);
  handler = new MediaHandler({
    origin,
    state: new EdgeState(env.MEDIA_EDGE, () => Date.now()),
    links: new LinkVerifier(env.MEDIA_LINK_SECRET, () => Date.now()),
    usage,
    cache: await caches.open(`test-${crypto.randomUUID()}`),
    dashboardOrigins: [DASHBOARD],
  });
});

/** One request through the handler, with everything it did after answering finished, and its body read. */
async function call(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: Uint8Array }> {
  const ctx = createExecutionContext();
  const response = await handler.handle(new Request(`${BASE}${path}`, init), ctx);
  const body = new Uint8Array(await response.arrayBuffer());
  await waitOnExecutionContext(ctx);
  return { response, body };
}

describe('serving public media (MED-02, BND-01)', () => {
  it('serves a public file for a year, from the store once and then from the cache, counting both', async () => {
    origin.put(KEY, bytesOf(5000));
    const first = await call(`/${KEY}`);
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(first.response.headers.get('content-type')).toBe('image/webp');
    expect(first.response.headers.get('content-length')).toBe('5000');
    expect(first.body).toEqual(bytesOf(5000));
    const second = await call(`/${KEY}`);
    expect(second.body).toEqual(bytesOf(5000));
    // MED-02: a cached image is still counted.
    expect(origin.reads).toHaveLength(1);
    expect(usage.points).toEqual([
      { tenantId: SHOP, access: 'public', status: 200, bytes: 5000 },
      { tenantId: SHOP, access: 'public', status: 200, bytes: 5000 },
    ]);
  });

  it('counts two range requests totalling 10 MB as 10 MB, from the store and from the cache', async () => {
    const video = bytesOf(20 * MB);
    origin.put(KEY, video, 'video/mp4');
    const first = await call(`/${KEY}`, { headers: { range: `bytes=0-${String(4 * MB - 1)}` } });
    expect(first.response.status).toBe(206);
    expect(first.response.headers.get('content-range')).toBe(
      `bytes 0-${String(4 * MB - 1)}/${String(20 * MB)}`,
    );
    expect(first.body.byteLength).toBe(4 * MB);
    const second = await call(`/${KEY}`, {
      headers: { range: `bytes=${String(4 * MB)}-${String(10 * MB - 1)}` },
    });
    expect(await digest(second.body)).toBe(await digest(video.slice(4 * MB, 10 * MB)));
    expect(usage.points.reduce((sum, point) => sum + point.bytes, 0)).toBe(10 * MB);
    // A range that missed is read alone and not kept: both went to the store.
    expect(origin.reads.map((read) => read.range)).toEqual([
      `bytes=0-${String(4 * MB - 1)}`,
      `bytes=${String(4 * MB)}-${String(10 * MB - 1)}`,
    ]);

    // Once the whole file is cached, a range is answered from the cache, and still counted by its bytes.
    usage.points.length = 0;
    await call(`/${KEY}`);
    const cached = await call(`/${KEY}`, { headers: { range: 'bytes=100-199' } });
    expect(cached.response.status).toBe(206);
    expect(cached.body).toEqual(video.slice(100, 200));
    expect(origin.reads).toHaveLength(3);
    expect(usage.points.at(-1)).toMatchObject({ status: 206, bytes: 100 });
  }, 30_000);

  it('counts only what went when a download stops part-way', async () => {
    origin.put(KEY, bytesOf(2 * MB));
    const ctx = createExecutionContext();
    const response = await handler.handle(new Request(`${BASE}/${KEY}`), ctx);
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    const firstChunk = await reader?.read();
    await reader?.cancel();
    await waitOnExecutionContext(ctx);
    const [point] = usage.points;
    expect(point?.bytes).toBeGreaterThanOrEqual(firstChunk?.value?.byteLength ?? 1);
    expect(point?.bytes).toBeLessThan(2 * MB);
  });

  it('answers a HEAD with the length and no body, counting no bytes', async () => {
    origin.put(KEY, bytesOf(3000));
    const { response, body } = await call(`/${KEY}`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('3000');
    expect(body.byteLength).toBe(0);
    expect(usage.points).toEqual([{ tenantId: SHOP, access: 'public', status: 200, bytes: 0 }]);
  });

  it('answers 404 for a missing file, counted, and for a path outside a shop, not counted', async () => {
    expect((await call(`/tenants/${SHOP}/m1/missing.webp`)).response.status).toBe(404);
    // An escaped slash cannot hide another path inside a name.
    expect((await call(`/tenants/${SHOP}/m1/a%2F..%2F${OTHER_SHOP}.webp`)).response.status).toBe(
      404,
    );
    expect((await call('/key-check/x.txt')).response.status).toBe(404);
    expect(usage.points).toEqual([{ tenantId: SHOP, access: 'public', status: 404, bytes: 0 }]);
  });

  it('answers 503 with when to try again while the store is away (MED-11)', async () => {
    origin.down = true;
    const { response } = await call(`/${KEY}`);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});

describe('refusing a blocked shop (MED-02, MED-10, BND-03)', () => {
  it('refuses a shop over its bandwidth with 429 and X-Quota, and no body, before the store is read', async () => {
    origin.put(KEY, bytesOf(1000));
    await env.MEDIA_EDGE.put(MEDIA_BLOCKED_KEY, JSON.stringify({ [SHOP]: 'bandwidth' }));
    const { response, body } = await call(`/${KEY}`);
    expect(response.status).toBe(429);
    expect(response.headers.get('x-quota')).toBe('bandwidth');
    expect(body.byteLength).toBe(0);
    expect(origin.reads).toEqual([]);
    expect(usage.points).toEqual([{ tenantId: SHOP, access: 'public', status: 429, bytes: 0 }]);
    // Another shop is served.
    origin.put(`tenants/${OTHER_SHOP}/m1/a.webp`, bytesOf(10));
    expect((await call(`/tenants/${OTHER_SHOP}/m1/a.webp`)).response.status).toBe(200);
  });

  it("refuses an offline shop's media to everyone but the dashboard, before the cache or the store", async () => {
    origin.put(KEY, bytesOf(1000));
    await call(`/${KEY}`);
    await env.MEDIA_EDGE.put(MEDIA_BLOCKED_KEY, JSON.stringify({ [SHOP]: 'offline' }));
    handler = new MediaHandler({
      origin,
      state: new EdgeState(env.MEDIA_EDGE, () => Date.now()),
      links: new LinkVerifier(env.MEDIA_LINK_SECRET, () => Date.now()),
      usage,
      cache: await caches.open(`test-${crypto.randomUUID()}`),
      dashboardOrigins: [DASHBOARD],
    });
    const shopper = await call(`/${KEY}`, {
      headers: { referer: 'https://myshop.lytro.test/p/1' },
    });
    expect(shopper.response.status).toBe(403);
    expect(origin.reads).toHaveLength(1);
    const owner = await call(`/${KEY}`, { headers: { referer: `${DASHBOARD}/myshop/products` } });
    expect(owner.response.status).toBe(200);
  });
});

describe('private media through signed links (BND-07)', () => {
  const PRIVATE = `tenants/${SHOP}/private/proof.webp`;

  it('serves a private file only through a valid link, and never for caching', async () => {
    origin.put(PRIVATE, bytesOf(800));
    expect((await call(`/${PRIVATE}`)).response.status).toBe(403);
    const expires = Math.floor(Date.now() / 1000) + 15 * 60;
    const query = await signedQuery(env.MEDIA_LINK_SECRET, `/${PRIVATE}`, expires);
    const { response, body } = await call(`/${PRIVATE}?${query}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body).toEqual(bytesOf(800));
    // Never cached: the next valid request reads the store again.
    await call(`/${PRIVATE}?${query}`);
    expect(origin.reads).toHaveLength(2);
    const expired = await signedQuery(
      env.MEDIA_LINK_SECRET,
      `/${PRIVATE}`,
      Math.floor(Date.now() / 1000) - 1,
    );
    expect((await call(`/${PRIVATE}?${expired}`)).response.status).toBe(403);
    expect(usage.points.map((point) => [point.access, point.status])).toEqual([
      ['private', 403],
      ['private', 200],
      ['private', 200],
      ['private', 403],
    ]);
  });
});

describe("a script on the shop's own sites (MED-13)", () => {
  it('lets only registered website addresses and the dashboard read media by script', async () => {
    origin.put(KEY, bytesOf(100));
    await env.MEDIA_EDGE.put(mediaOriginsKey(SHOP), JSON.stringify([SHOP_SITE]));
    const registered = await call(`/${KEY}`, { headers: { origin: SHOP_SITE } });
    expect(registered.response.status).toBe(200);
    expect(registered.response.headers.get('access-control-allow-origin')).toBe(SHOP_SITE);
    expect(registered.response.headers.get('vary')).toBe('Origin');
    const stranger = await call(`/${KEY}`, { headers: { origin: 'https://copycat.example' } });
    expect(stranger.response.status).toBe(403);
    expect(stranger.response.headers.get('access-control-allow-origin')).toBeNull();
    const dashboard = await call(`/${KEY}`, { headers: { origin: DASHBOARD } });
    expect(dashboard.response.headers.get('access-control-allow-origin')).toBe(DASHBOARD);
    // A plain image load sends no origin, and needs none.
    expect((await call(`/${KEY}`)).response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight from a registered site, and refuses one from anywhere else', async () => {
    await env.MEDIA_EDGE.put(mediaOriginsKey(SHOP), JSON.stringify([SHOP_SITE]));
    const preflight = await call(`/${KEY}`, {
      method: 'OPTIONS',
      headers: { origin: SHOP_SITE, 'access-control-request-method': 'GET' },
    });
    expect(preflight.response.status).toBe(204);
    expect(preflight.response.headers.get('access-control-allow-methods')).toBe('GET, HEAD');
    expect(preflight.response.headers.get('access-control-allow-headers')).toBe('Range');
    const refused = await call(`/${KEY}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://copycat.example', 'access-control-request-method': 'GET' },
    });
    expect(refused.response.status).toBe(403);
    expect(origin.reads).toEqual([]);
  });
});
