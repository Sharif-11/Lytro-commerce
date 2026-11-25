import { describe, expect, it } from 'vitest';
import { browserOpening } from '../src/components/product/use-browser-opening';
import {
  EDGE_HOST_HEADER,
  EDGE_LIFETIMES,
  EDGE_RENDER_HEADER,
  EdgeCachePolicy,
  type EdgeRequest,
  edgeHeaders,
  edgeMarkContent,
  readEdgeMarks,
} from '../src/lib/edge/edge-cache';
import { EdgeRenderer } from '../src/lib/edge/edge-renderer';
import { shopPageTags } from '../src/lib/edge/edge-tags';
import { estimateQueryString, readEstimateQuery } from '../src/lib/product/estimate-query';

// Slice 9.10, D9-32: a shop's pages kept at Cloudflare's edge -- which requests may be, what a page's marks say, the
// headers the edge keeps a page by, and the middleware's render of such a page.

const policy = new EdgeCachePolicy('lytro.app');

function request(
  overrides: Partial<Omit<EdgeRequest, 'header' | 'cookie'>> & {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
): EdgeRequest {
  const { headers = {}, cookies = {}, ...rest } = overrides;
  return {
    method: 'GET',
    host: 'megh.lytro.app',
    path: '/p/kurti',
    header: (name) => headers[name] ?? null,
    cookie: (name) => cookies[name],
    ...rest,
  };
}

describe('which requests the edge may keep', () => {
  it("keeps a shop's home, category, product, landing and new-arrivals pages five minutes, search one", () => {
    for (const path of ['/', '/c/panjabi', '/p/kurti', '/l/kurti', '/new']) {
      expect(policy.lifetimeOf(request({ path }))).toEqual(EDGE_LIFETIMES.page);
    }
    expect(policy.lifetimeOf(request({ path: '/search' }))).toEqual(EDGE_LIFETIMES.search);
    expect(EDGE_LIFETIMES.page.maxAge).toBe(300);
    expect(EDGE_LIFETIMES.search.maxAge).toBe(60);
  });

  it('never keeps the cart, checkout, account, an order, tracking, signing in or a deeper path', () => {
    for (const path of [
      '/cart',
      '/checkout',
      '/account',
      '/account/profile',
      '/order/abc',
      '/track',
      '/sign-in',
      '/sign-up',
      '/offline',
      '/p/kurti/more',
      '/p/',
    ]) {
      expect(policy.lifetimeOf(request({ path }))).toBeNull();
    }
  });

  it("keeps only a GET, on a shop's Lytro address, not its own domain", () => {
    expect(policy.lifetimeOf(request({ method: 'POST' }))).toBeNull();
    expect(policy.lifetimeOf(request({ method: 'HEAD' }))).toBeNull();
    expect(policy.lifetimeOf(request({ host: 'megh.com' }))).toBeNull();
    expect(policy.lifetimeOf(request({ host: 'lytro.app' }))).toBeNull();
    expect(policy.lifetimeOf(request({ host: 'a.megh.lytro.app' }))).toBeNull();
    expect(policy.lifetimeOf(request({ host: 'megh.lytro.app:443' }))).toEqual(EDGE_LIFETIMES.page);
    expect(new EdgeCachePolicy('localhost').isShopAddress('megh.localhost:3101')).toBe(true);
  });

  it("is never one shopper's: signed in, English, the storefront's own render or Next's navigation", () => {
    expect(policy.lifetimeOf(request({ cookies: { 'lytro-shopper': 't' } }))).toBeNull();
    expect(policy.lifetimeOf(request({ cookies: { 'lytro-lang': 'en' } }))).toBeNull();
    expect(policy.lifetimeOf(request({ cookies: { 'lytro-lang': 'bn' } }))).toEqual(
      EDGE_LIFETIMES.page,
    );
    expect(policy.lifetimeOf(request({ cookies: { 'lytro-area': '42' } }))).toEqual(
      EDGE_LIFETIMES.page,
    );
    expect(policy.lifetimeOf(request({ headers: { [EDGE_RENDER_HEADER]: '1' } }))).toBeNull();
    expect(policy.lifetimeOf(request({ headers: { rsc: '1' } }))).toBeNull();
  });
});

describe("a page's marks", () => {
  it('reads tags, a busy wait and a private page', () => {
    const html = [
      '<html><head>',
      `<meta name="lytro-edge" content="${edgeMarkContent({ kind: 'tags', tags: ['lytro', 's:megh'] })}"/>`,
      '</head><body>',
      `<meta name="lytro-edge" content="${edgeMarkContent({ kind: 'tags', tags: ['s:megh', 'p:1'] })}">`,
      '</body></html>',
    ].join('');
    expect(readEdgeMarks(html)).toEqual({
      tags: ['lytro', 's:megh', 'p:1'],
      busySeconds: null,
      private: false,
    });
    expect(
      readEdgeMarks(
        `<meta name="lytro-edge" content="${edgeMarkContent({ kind: 'busy', seconds: 30 })}"/>`,
      ),
    ).toEqual({ tags: null, busySeconds: 30, private: false });
    expect(readEdgeMarks('<meta name="lytro-edge" content="private"/>').private).toBe(true);
    expect(readEdgeMarks('<p>no marks</p>')).toEqual({
      tags: null,
      busySeconds: null,
      private: false,
    });
  });

  it("names every page, the shop's, its listings and each product shown, once each", () => {
    expect(
      shopPageTags('megh', { listing: true, products: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }),
    ).toEqual(['lytro', 's:megh', 'l:megh', 'p:a', 'p:b']);
    expect(shopPageTags('megh', {})).toEqual(['lytro', 's:megh']);
  });

  it('gives the edge its lifetime, a stale page while it fetches anew or the server fails, and the tags', () => {
    expect(edgeHeaders(EDGE_LIFETIMES.page, ['lytro', 's:megh'])).toEqual({
      'cloudflare-cdn-cache-control':
        'max-age=300, stale-while-revalidate=600, stale-if-error=86400',
      'cache-tag': 'lytro,s:megh',
    });
  });
});

/** A storefront answering the renderer's second request as the page would. */
function storefront(status: number, body: string, headers: Record<string, string> = {}) {
  const asked: { url: string; headers: Headers }[] = [];
  const fetcher: typeof fetch = (input, init) => {
    asked.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: new Headers(init?.headers),
    });
    return Promise.resolve(
      new Response(body, {
        status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': '999',
          ...headers,
        },
      }),
    );
  };
  return { asked, fetcher };
}

const shopperPage = {
  url: new URL('http://megh.lytro.app/p/kurti?v=2&fbclid=abc'),
  headers: new Headers({
    host: 'megh.lytro.app',
    'x-forwarded-for': '103.10.20.30',
    connection: 'keep-alive',
  }),
};
const tagged = '<html><meta name="lytro-edge" content="tags lytro s:megh p:1"/><p>Kurti</p></html>';

describe("the middleware's render for the edge", () => {
  it('asks the storefront again as the shopper, and gives the page its lifetime and tags', async () => {
    const fake = storefront(200, tagged, { 'cache-control': 'private, no-cache, no-store' });
    const answer = await new EdgeRenderer('http://127.0.0.1:3001', fake.fetcher).render(
      shopperPage,
      EDGE_LIFETIMES.page,
    );
    expect(fake.asked[0]?.url).toBe('http://127.0.0.1:3001/p/kurti?v=2&fbclid=abc');
    const sent = fake.asked[0]?.headers;
    expect(sent?.get(EDGE_RENDER_HEADER)).toBe('1');
    expect(sent?.get(EDGE_HOST_HEADER)).toBe('megh.lytro.app');
    expect(sent?.get('x-forwarded-for')).toBe('103.10.20.30');
    expect(sent?.get('accept-encoding')).toBe('identity');
    expect(sent?.has('connection')).toBe(false);
    expect(answer?.status).toBe(200);
    expect(answer?.headers.get('cloudflare-cdn-cache-control')).toMatch(/^max-age=300,/);
    expect(answer?.headers.get('cache-tag')).toBe('lytro,s:megh,p:1');
    // Browsers keep nothing: a purge can't reach them.
    expect(answer?.headers.get('cache-control')).toBe('private, no-cache, no-store');
    expect(answer?.headers.has('content-length')).toBe(false);
    expect(await answer?.text()).toBe(tagged);
  });

  it("answers a busy server's page with a 503 and its wait, which the edge never keeps", async () => {
    const fake = storefront(200, '<meta name="lytro-edge" content="busy 30"/><p>Busy</p>');
    const answer = await new EdgeRenderer('http://127.0.0.1:3001', fake.fetcher).render(
      shopperPage,
      EDGE_LIFETIMES.page,
    );
    expect(answer?.status).toBe(503);
    expect(answer?.headers.get('retry-after')).toBe('30');
    expect(answer?.headers.get('cache-control')).toBe('no-store');
    expect(answer?.headers.has('cloudflare-cdn-cache-control')).toBe(false);
  });

  it('keeps nothing without tags, a private page, a cookie set, or anything but 200', async () => {
    const cases: [number, string, Record<string, string>][] = [
      [200, '<p>Offline</p>', {}],
      [200, '<meta name="lytro-edge" content="private"/>', {}],
      [200, tagged, { 'set-cookie': 'a=b' }],
      [404, tagged, {}],
      [308, tagged, { location: '/p/new' }],
    ];
    for (const [status, body, headers] of cases) {
      const fake = storefront(status, body, headers);
      const answer = await new EdgeRenderer('http://127.0.0.1:3001', fake.fetcher).render(
        shopperPage,
        EDGE_LIFETIMES.page,
      );
      expect(answer?.status).toBe(status);
      expect(answer?.headers.has('cloudflare-cdn-cache-control')).toBe(false);
    }
  });

  it("leads a redirect to the shopper's own host, so the middleware can answer it", async () => {
    const fake = storefront(308, '', {
      location: '/p/0b8f3c52-1e6a-4d7b-9c2f-8a5e3d1b6c40?v=2&fbclid=abc',
    });
    const answer = await new EdgeRenderer('http://127.0.0.1:3001', fake.fetcher).render(
      shopperPage,
      EDGE_LIFETIMES.page,
    );
    expect(answer?.status).toBe(308);
    expect(answer?.headers.get('location')).toBe(
      'http://megh.lytro.app/p/0b8f3c52-1e6a-4d7b-9c2f-8a5e3d1b6c40?v=2&fbclid=abc',
    );
    // Kept nowhere: the edge keeps a product's page whatever its query, so a kept redirect would hand one link's
    // `?v=` to every other.
    expect(answer?.headers.has('cloudflare-cdn-cache-control')).toBe(false);
  });

  it('leaves the page to the usual render when the storefront could not be asked', async () => {
    const failing = (() => Promise.reject(new Error('refused'))) as typeof fetch;
    expect(
      await new EdgeRenderer('http://127.0.0.1:3001', failing).render(
        shopperPage,
        EDGE_LIFETIMES.page,
      ),
    ).toBeNull();
  });
});

describe("one product's charge, in the form the edge keeps", () => {
  const productId = '0b5e7f5e-1c1d-4c6a-9a8e-3f2d1c0b9a87';
  const variantId = '7d2c1b0a-9e8f-4a6b-8c5d-1e2f3a4b5c6d';

  it('goes to an address and back, with or without an area', () => {
    const withArea = estimateQueryString({ productId, variantId, quantity: 2, areaId: 42 });
    expect(withArea).toBe(`p=${productId}&v=${variantId}&q=2&a=42`);
    expect(readEstimateQuery(new URLSearchParams(withArea))).toEqual({
      productId,
      variantId,
      quantity: 2,
      areaId: 42,
    });
    const weighed = estimateQueryString({ productId, variantId, quantity: 0.5, areaId: null });
    expect(readEstimateQuery(new URLSearchParams(weighed))).toEqual({
      productId,
      variantId,
      quantity: 0.5,
      areaId: null,
    });
  });

  it('refuses anything a page would not send', () => {
    for (const query of [
      `p=x y&v=${variantId}&q=1`,
      `p=${productId}&v=${'x'.repeat(65)}&q=1`,
      `p=${productId}&v=${variantId}&q=0`,
      `p=${productId}&v=${variantId}&q=-1`,
      `p=${productId}&v=${variantId}`,
      `p=${productId}&v=${variantId}&q=1&a=0`,
      `p=${productId}&v=${variantId}&q=1&a=abc`,
    ]) {
      expect(readEstimateQuery(new URLSearchParams(query))).toBeNull();
    }
  });
});

describe("the shopper's own link and area, read in the browser", () => {
  it("takes the `?v=` link, a design card's `?d=` and the remembered area, and nothing else", () => {
    expect(browserOpening('?v=abc&fbclid=x', 'lytro-lang=bn; lytro-area=42')).toEqual({
      linkedVariantId: 'abc',
      linkedDesignId: null,
      areaId: 42,
    });
    // STOREFRONT-BUILDER-PLAN DC-3: a design card's link names its design.
    expect(browserOpening('?d=d2', '')).toEqual({
      linkedVariantId: null,
      linkedDesignId: 'd2',
      areaId: null,
    });
    const none = { linkedVariantId: null, linkedDesignId: null, areaId: null };
    expect(browserOpening('', 'lytro-area=bad')).toEqual(none);
    expect(browserOpening('?v=&d=', '')).toEqual(none);
  });
});
