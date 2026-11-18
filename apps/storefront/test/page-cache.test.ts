import {
  CLEAR_PAGE_TAGS_SCRIPT,
  PAGE_TAG_KEEP_MS,
  PAGE_TAG_TIMES_KEY,
} from '@lytronix/validators/edge';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EDGE_LIFETIMES, EDGE_RENDER_HEADER, type EdgeRequest } from '../src/lib/edge/edge-cache';
import { EdgeRenderer, type ShopperPageRequest } from '../src/lib/edge/edge-renderer';
import { PageKeepPolicy } from '../src/lib/edge/page-keep';
import {
  figuresLine,
  PAGE_CACHE_HEADER,
  PageServer,
  type PageServerTiming,
} from '../src/lib/edge/page-server';
import {
  type DrawTurn,
  type KeptPage,
  type PageLookup,
  type PageStore,
  RedisPageStore,
} from '../src/lib/edge/page-store';

// D9-33: drawn pages every shopper of a shop sees alike, kept in the storefront's own Redis: which ones and under what
// key, how they are answered and drawn at most once, and the Redis scripts themselves against a real Redis
// (REDIS_TEST_URL, as CI's unit job sets; skipped without one).

const policy = new PageKeepPolicy('release-1');

function request(
  overrides: Partial<Omit<EdgeRequest, 'header' | 'cookie'>> & {
    search?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
) {
  const { headers = {}, cookies = {}, search = '', ...rest } = overrides;
  return {
    method: 'GET',
    host: 'megh.lytro.app',
    path: '/p/kurti',
    search,
    header: (name: string) => headers[name] ?? null,
    cookie: (name: string) => cookies[name],
    ...rest,
  };
}

describe('which pages the page cache keeps', () => {
  it("keeps every page every shopper sees alike: Bangla or English, a Lytro address or the shop's own domain", () => {
    for (const each of [
      request(),
      request({ cookies: { 'lytro-lang': 'en' } }),
      request({ host: 'shop.example.com' }),
      request({ path: '/' }),
      request({ path: '/c/sharee' }),
      request({ path: '/l/eid-offer' }),
      request({ path: '/new' }),
      request({ path: '/offers' }),
      request({ path: '/best' }),
    ]) {
      expect(policy.keepOf(each)?.lifetime, each.path).toEqual(EDGE_LIFETIMES.page);
    }
    expect(policy.keepOf(request({ path: '/search', search: '?q=kurti' }))?.lifetime).toEqual(
      EDGE_LIFETIMES.search,
    );
  });

  it("keeps nothing for one shopper, the storefront's own render, a navigation, or a page that changes things", () => {
    for (const each of [
      request({ cookies: { 'lytro-shopper': 'token' } }),
      request({ headers: { [EDGE_RENDER_HEADER]: '1' } }),
      request({ headers: { rsc: '1' } }),
      request({ headers: { 'next-router-prefetch': '1' } }),
      request({ method: 'POST' }),
      request({ method: 'HEAD' }),
      request({ path: '/cart' }),
      request({ path: '/checkout' }),
      request({ path: '/account' }),
      request({ path: '/order/abc' }),
      request({ path: '/track' }),
      request({ path: '/preview' }),
      request({ path: '/p/kurti/extra' }),
      request({ host: '' }),
    ]) {
      expect(policy.keepOf(each)).toBeNull();
    }
  });

  it('keeps apart what could differ: the build, the shop, the language, the page, and a query the page reads', () => {
    const key = (each: ReturnType<typeof request>, keeping = policy) => keeping.keepOf(each)?.key;
    const base = key(request());
    expect(base).toMatch(/^page:[0-9a-f]{64}$/);
    for (const other of [
      key(request(), new PageKeepPolicy('release-2')),
      key(request({ host: 'faiza.lytro.app' })),
      key(request({ cookies: { 'lytro-lang': 'en' } })),
      key(request({ path: '/p/sharee' })),
    ]) {
      expect(other).not.toBe(base);
    }
    expect(key(request({ path: '/search', search: '?q=kurti' }))).not.toBe(
      key(request({ path: '/search', search: '?q=sharee' })),
    );
    expect(key(request({ path: '/c/sharee', search: '?sort=newest' }))).not.toBe(
      key(request({ path: '/c/sharee' })),
    );
  });

  it("keeps one copy whatever an address's port, case, order or tracking words, and whatever a product page's query", () => {
    const key = (each: ReturnType<typeof request>) => policy.keepOf(each)?.key;
    expect(key(request({ host: 'MEGH.lytro.app:443' }))).toBe(key(request()));
    expect(key(request({ cookies: { 'lytro-lang': 'bn' } }))).toBe(key(request()));
    // A product, landing or home page draws the same whatever its query: a `?v=` link is applied in the browser.
    for (const path of ['/', '/p/kurti', '/l/eid-offer']) {
      expect(key(request({ path, search: '?v=abc&fbclid=x' }))).toBe(key(request({ path })));
    }
    expect(
      key(request({ path: '/c/sharee', search: '?stock=in&sort=newest&utm_source=fb&fbclid=1' })),
    ).toBe(key(request({ path: '/c/sharee', search: '?sort=newest&stock=in' })));
    expect(key(request({ path: '/search', search: '?q=red+kurti&gclid=9' }))).toBe(
      key(request({ path: '/search', search: '?q=red%20kurti' })),
    );
  });

  it('writes a query in one order, with what no page reads left out', () => {
    expect(PageKeepPolicy.queryOf('?b=2&a=1&utm_medium=x&a=0')).toBe('a=0&a=1&b=2');
    expect(PageKeepPolicy.queryOf('')).toBe('');
  });
});

/** A page store in memory, with Redis's clock set by the test. */
class MemoryPageStore implements PageStore {
  readonly pages = new Map<string, KeptPage>();
  readonly tagTimes = new Map<string, number>();
  readonly turns = new Set<string>();
  now = 1_000_000;
  available = true;
  finds = 0;

  find(key: string): Promise<PageLookup> {
    this.finds += 1;
    if (!this.available) return Promise.resolve({ kind: 'unavailable' });
    const page = this.pages.get(key);
    if (page === undefined || page.freshUntil <= this.now || this.changed(page)) {
      this.pages.delete(key);
      return Promise.resolve({ kind: 'missing', now: this.now });
    }
    return Promise.resolve({ kind: 'kept', page, now: this.now });
  }

  keep(key: string, page: KeptPage): Promise<boolean> {
    if (!this.available || page.freshUntil <= this.now || this.changed(page)) {
      return Promise.resolve(false);
    }
    this.pages.set(key, page);
    return Promise.resolve(true);
  }

  takeTurn(key: string): Promise<DrawTurn> {
    if (!this.available) return Promise.resolve('unavailable');
    if (this.turns.has(key)) return Promise.resolve('held');
    this.turns.add(key);
    return Promise.resolve('taken');
  }

  endTurn(key: string): Promise<void> {
    this.turns.delete(key);
    return Promise.resolve();
  }

  clear(tag: string): void {
    this.tagTimes.set(tag, this.now);
  }

  private changed(page: KeptPage): boolean {
    return page.tags.some((tag) => (this.tagTimes.get(tag) ?? -1) >= page.drawnAt);
  }
}

const tagged = (name: string) =>
  `<html><meta name="lytro-edge" content="tags lytro s:megh p:1"/><p>${name}</p></html>`;

/** The storefront's own render, counted, answering whatever page the test sets. */
function storefront(start: { status: number; body: string; headers?: Record<string, string> }) {
  const state = { ...start, draws: 0, release: null as Promise<void> | null };
  const fetcher = (async () => {
    state.draws += 1;
    if (state.release !== null) await state.release;
    return new Response(state.body, {
      status: state.status,
      headers: { 'content-type': 'text/html; charset=utf-8', date: 'today', ...state.headers },
    });
  }) as typeof fetch;
  return { state, renderer: new EdgeRenderer('http://127.0.0.1:3001', fetcher) };
}

const instant: PageServerTiming = {
  turnMs: 15_000,
  waitMs: 300,
  pollMs: 100,
  sleep: () => Promise.resolve(),
};

const shopperPage: ShopperPageRequest = {
  url: new URL('http://megh.lytro.app/p/kurti'),
  headers: new Headers({ host: 'megh.lytro.app' }),
};
const keep = { key: 'page:kurti', lifetime: EDGE_LIFETIMES.page };

describe('answering a page from the page cache', () => {
  it('draws a missing page once, keeps it, and answers the next visit from the copy', async () => {
    const store = new MemoryPageStore();
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    const server = new PageServer(store, shop.renderer, instant);

    const first = await server.answer(shopperPage, keep, EDGE_LIFETIMES.page);
    expect(first?.headers.get(PAGE_CACHE_HEADER)).toBe('miss');
    expect(first?.headers.get('cloudflare-cdn-cache-control')).toMatch(/^max-age=300,/);
    expect(await first?.text()).toBe(tagged('Kurti'));
    const kept = store.pages.get(keep.key);
    expect(kept?.drawnAt).toBe(1_000_000);
    expect(kept?.freshUntil).toBe(1_300_000);
    expect(kept?.tags).toEqual(['lytro', 's:megh', 'p:1']);
    // What says something about one answer, not the page, isn't kept.
    expect(kept?.headers.map(([name]) => name)).not.toContain('date');

    store.now += 120_000;
    const second = await server.answer(shopperPage, keep, EDGE_LIFETIMES.page);
    expect(shop.state.draws).toBe(1);
    expect(second?.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    expect(second?.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await second?.text()).toBe(tagged('Kurti'));
    // Cloudflare is told only what is left of the copy's time, so a page is never older than its lifetime there.
    expect(second?.headers.get('cloudflare-cdn-cache-control')).toBe(
      'max-age=180, stale-while-revalidate=600, stale-if-error=86400',
    );
    expect(second?.headers.get('cache-tag')).toBe('lytro,s:megh,p:1');
  });

  it("gives a page the edge doesn't keep (English, a shop's own domain) no edge headers, from the copy or not", async () => {
    const store = new MemoryPageStore();
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    const server = new PageServer(store, shop.renderer, instant);
    const drawn = await server.answer(shopperPage, keep, null);
    const kept = await server.answer(shopperPage, keep, null);
    for (const answer of [drawn, kept]) {
      expect(answer?.status).toBe(200);
      expect(answer?.headers.has('cloudflare-cdn-cache-control')).toBe(false);
      expect(answer?.headers.has('cache-tag')).toBe(false);
    }
    expect(kept?.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
  });

  it('draws again once a purge names one of its tags, and when its time is up', async () => {
    const store = new MemoryPageStore();
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    const server = new PageServer(store, shop.renderer, instant);
    await server.answer(shopperPage, keep, null);

    store.now += 1_000;
    store.clear('p:1');
    shop.state.body = tagged('Kurti, cheaper');
    store.now += 1_000;
    expect(await (await server.answer(shopperPage, keep, null))?.text()).toBe(
      tagged('Kurti, cheaper'),
    );
    expect(shop.state.draws).toBe(2);

    store.now += EDGE_LIFETIMES.page.maxAge * 1000;
    await server.answer(shopperPage, keep, null);
    expect(shop.state.draws).toBe(3);
  });

  it('never keeps a page a purge reached while it was being drawn: it may show the old', async () => {
    const store = new MemoryPageStore();
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    let release!: () => void;
    shop.state.release = new Promise((resolve) => {
      release = resolve;
    });
    const server = new PageServer(store, shop.renderer, instant);
    const answering = server.answer(shopperPage, keep, null);
    await Promise.resolve();
    store.now += 500;
    store.clear('s:megh');
    release();
    expect((await answering)?.status).toBe(200);
    expect(store.pages.has(keep.key)).toBe(false);
  });

  it('draws once for every request in this process that asks together', async () => {
    const store = new MemoryPageStore();
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    let release!: () => void;
    shop.state.release = new Promise((resolve) => {
      release = resolve;
    });
    const server = new PageServer(store, shop.renderer, instant);
    const answers = [1, 2, 3, 4, 5].map(() =>
      server.answer(shopperPage, keep, EDGE_LIFETIMES.page),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    const done = await Promise.all(answers);
    expect(shop.state.draws).toBe(1);
    for (const answer of done) expect(await answer?.text()).toBe(tagged('Kurti'));
  });

  it("waits for another process's drawing and answers its copy, or draws itself when none comes", async () => {
    const store = new MemoryPageStore();
    store.turns.add(keep.key);
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    const sleeps: number[] = [];
    const theirs: KeptPage = {
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      html: tagged('Theirs'),
      tags: ['lytro'],
      drawnAt: store.now,
      freshUntil: store.now + 300_000,
    };
    const timing: PageServerTiming = {
      ...instant,
      sleep: (ms) => {
        sleeps.push(ms);
        if (sleeps.length === 2) store.pages.set(keep.key, theirs);
        return Promise.resolve();
      },
    };
    const server = new PageServer(store, shop.renderer, timing);
    const answer = await server.answer(shopperPage, keep, null);
    expect(await answer?.text()).toBe(tagged('Theirs'));
    expect(answer?.headers.get(PAGE_CACHE_HEADER)).toBe('hit');
    expect(shop.state.draws).toBe(0);

    // No copy in time: this process draws it, and leaves the other's turn as it was.
    store.pages.clear();
    const alone = new PageServer(store, shop.renderer, instant);
    expect(await (await alone.answer(shopperPage, keep, null))?.text()).toBe(tagged('Kurti'));
    expect(shop.state.draws).toBe(1);
    expect(store.turns.has(keep.key)).toBe(true);
  });

  it("keeps nothing a shopper mustn't share, and answers it as drawn", async () => {
    const cases: { status: number; body: string; headers?: Record<string, string> }[] = [
      { status: 200, body: '<p>Offline</p>' },
      { status: 200, body: '<meta name="lytro-edge" content="private"/>' },
      { status: 200, body: tagged('Kurti'), headers: { 'set-cookie': 'a=b' } },
      { status: 404, body: tagged('Missing') },
      { status: 200, body: '<meta name="lytro-edge" content="busy 30"/>' },
    ];
    for (const each of cases) {
      const store = new MemoryPageStore();
      const shop = storefront(each);
      const answer = await new PageServer(store, shop.renderer, instant).answer(
        shopperPage,
        keep,
        EDGE_LIFETIMES.page,
      );
      expect(store.pages.size, each.body).toBe(0);
      expect(answer?.status).toBe(each.body.includes('busy') ? 503 : each.status);
      expect(answer?.headers.has('cloudflare-cdn-cache-control')).toBe(false);
    }
  });

  it("renders as it did without the page cache while Redis doesn't answer", async () => {
    const store = new MemoryPageStore();
    store.available = false;
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    const server = new PageServer(store, shop.renderer, instant);
    // The edge's own render when Cloudflare keeps the page...
    const edge = await server.answer(shopperPage, keep, EDGE_LIFETIMES.page);
    expect(edge?.headers.get('cloudflare-cdn-cache-control')).toMatch(/^max-age=300,/);
    expect(edge?.headers.has(PAGE_CACHE_HEADER)).toBe(false);
    // ...and the usual one otherwise.
    expect(await server.answer(shopperPage, keep, null)).toBeNull();
  });

  it('counts each page answered, from a copy, drawn, or without Redis, for the log line a minute', async () => {
    const store = new MemoryPageStore();
    const shop = storefront({ status: 200, body: tagged('Kurti') });
    const server = new PageServer(store, shop.renderer, instant);
    await server.answer(shopperPage, keep, null);
    await server.answer(shopperPage, keep, null);
    await server.answer(shopperPage, keep, null);
    store.available = false;
    await server.answer(shopperPage, keep, null);
    const figures = server.takeFigures();
    expect(figures).toEqual({ hits: 2, misses: 1, unavailable: 1 });
    expect(figuresLine(figures)).toBe(
      'page cache: 4 pages, 50% from the copy, 1 drawn, 1 without Redis',
    );
    expect(server.takeFigures()).toEqual({ hits: 0, misses: 0, unavailable: 0 });
    expect(figuresLine(server.takeFigures())).toBeNull();
  });

  it("leaves the page to the usual render when the storefront couldn't be asked", async () => {
    const failing = (() => Promise.reject(new Error('refused'))) as typeof fetch;
    const server = new PageServer(
      new MemoryPageStore(),
      new EdgeRenderer('http://127.0.0.1:3001', failing),
      instant,
    );
    expect(await server.answer(shopperPage, keep, EDGE_LIFETIMES.page)).toBeNull();
  });
});

const redisUrl = process.env['REDIS_TEST_URL'];

describe.skipIf(redisUrl === undefined)("the page cache's Redis scripts", () => {
  let redis: Redis;
  let store: RedisPageStore;
  const key = `page:test-${String(process.pid)}`;
  const page = (now: number, tags = ['lytro', 's:megh', 'p:1']): KeptPage => ({
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    html: 'কুর্তি '.repeat(2000),
    tags,
    drawnAt: now,
    freshUntil: now + 300_000,
  });
  const clear = (...tags: string[]) =>
    redis.eval(CLEAR_PAGE_TAGS_SCRIPT, 1, PAGE_TAG_TIMES_KEY, PAGE_TAG_KEEP_MS, ...tags);
  const nowOf = async () => {
    const found = await store.find(`${key}:clock`);
    if (found.kind !== 'missing') throw new Error('expected nothing');
    return found.now;
  };

  beforeAll(() => {
    redis = new Redis(redisUrl ?? '', { maxRetriesPerRequest: 1 });
    store = new RedisPageStore(redis);
  });
  beforeEach(async () => {
    await redis.del(key, `${key}:turn`, PAGE_TAG_TIMES_KEY);
  });
  afterAll(async () => {
    await redis.del(key, `${key}:turn`, PAGE_TAG_TIMES_KEY);
    await redis.quit();
  });

  it('keeps a page gzipped, until its time is up, and finds it whole', async () => {
    const now = await nowOf();
    expect(await store.keep(key, page(now))).toBe(true);
    const found = await store.find(key);
    expect(found.kind).toBe('kept');
    if (found.kind !== 'kept') return;
    expect(found.page).toEqual(page(now));
    expect(found.now).toBeGreaterThanOrEqual(now);
    expect(await redis.hstrlen(key, 'b')).toBeLessThan(page(now).html.length / 10);
    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(290_000);
    expect(ttl).toBeLessThanOrEqual(300_000);
  });

  it('counts a page gone once a purge names a tag of it, and deletes it', async () => {
    const now = await nowOf();
    await store.keep(key, page(now));
    await clear('p:2', 's:other');
    expect((await store.find(key)).kind).toBe('kept');
    const clearedAt = Number(await clear('p:1'));
    expect(clearedAt).toBeGreaterThanOrEqual(now);
    expect((await store.find(key)).kind).toBe('missing');
    expect(await redis.exists(key)).toBe(0);
  });

  it('refuses to keep a page drawn before a purge of its tags, and keeps one drawn after', async () => {
    const before = await nowOf();
    await clear('s:megh');
    expect(await store.keep(key, page(before))).toBe(false);
    expect(await redis.exists(key)).toBe(0);
    const after = await nowOf();
    expect(await store.keep(key, page(after))).toBe(true);
    // A purge of every page reaches it too.
    await clear('lytro');
    expect((await store.find(key)).kind).toBe('missing');
  });

  it('refuses a page already past its time, and drops one that is', async () => {
    const now = await nowOf();
    expect(await store.keep(key, { ...page(now), freshUntil: now - 1 })).toBe(false);
    await redis.hset(
      key,
      'm',
      JSON.stringify({ ...page(now), html: undefined, freshUntil: now }),
      'b',
      'x',
    );
    expect((await store.find(key)).kind).toBe('missing');
  });

  it("keeps each tag's change time only as long as a page could still need it", async () => {
    await clear('p:1', 'p:2');
    const left = (await redis.call(
      'HPTTL',
      PAGE_TAG_TIMES_KEY,
      'FIELDS',
      '2',
      'p:1',
      'p:2',
    )) as number[];
    for (const ms of left) {
      expect(ms).toBeGreaterThan(PAGE_TAG_KEEP_MS - 5_000);
      expect(ms).toBeLessThanOrEqual(PAGE_TAG_KEEP_MS);
    }
    // The hash itself never expires, so a full Redis evicts pages, never the times.
    expect(await redis.pttl(PAGE_TAG_TIMES_KEY)).toBe(-1);
  });

  it('gives one process the turn to draw a page until it lets it go', async () => {
    expect(await store.takeTurn(key, 10_000)).toBe('taken');
    expect(await store.takeTurn(key, 10_000)).toBe('held');
    await store.endTurn(key);
    expect(await store.takeTurn(key, 10_000)).toBe('taken');
  });

  it("answers unavailable, and never throws, when Redis doesn't answer", async () => {
    const gone = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    const nowhere = new RedisPageStore(gone);
    expect(await nowhere.find(key)).toEqual({ kind: 'unavailable' });
    expect(await nowhere.keep(key, page(0))).toBe(false);
    expect(await nowhere.takeTurn(key, 1_000)).toBe('unavailable');
    await nowhere.endTurn(key);
    gone.disconnect();
  });
});
