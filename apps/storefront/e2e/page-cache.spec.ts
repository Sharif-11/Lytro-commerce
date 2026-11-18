import {
  CLEAR_PAGE_TAGS_SCRIPT,
  PAGE_TAG_KEEP_MS,
  PAGE_TAG_TIMES_KEY,
} from '@lytronix/validators/edge';
import { expect, test } from '@playwright/test';
import { Redis } from 'ioredis';
import { designed, designedVariant, type Language, meghShop, panjabi } from './support/fixtures';
import { MOCK_PORT, PAGE_CACHE_PORT } from './support/mock-server';

// D9-33: the storefront keeps a drawn page every shopper of its shop sees alike in its own Redis, and answers from it
// while it is fresh: in English and Bangla, on a shop's Lytro address. A second storefront runs with the page cache's
// Redis (REDIS_TEST_URL; playwright.config.ts), so the rest of the suite still sees every page drawn. The server's purge
// is played here by its own script (packages/validators), as the worker runs it.

const REDIS_URL = process.env['REDIS_TEST_URL'];
const CACHE = 'x-lytro-page-cache';
const EDGE = 'cloudflare-cdn-cache-control';
const MOCK = `http://127.0.0.1:${String(MOCK_PORT)}`;

test.skip(REDIS_URL === undefined, 'needs the page cache Redis (REDIS_TEST_URL)');

let redis: Redis;
test.beforeAll(() => {
  redis = new Redis(REDIS_URL ?? '', { maxRetriesPerRequest: 1 });
});
test.afterAll(async () => {
  await redis.quit();
});

/** A shop of the test's own, on the page-cached storefront; `language` sets the shopper's cookie when English. */
async function shopOf(
  page: import('@playwright/test').Page,
  language: Language,
  make: (slug: string) => ReturnType<typeof meghShop> = (slug) => meghShop(language, { slug }),
) {
  const slug = `k${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const fixture = make(slug);
  const sendShop = async (shop: typeof fixture) => {
    const made = await fetch(`${MOCK}/__shop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(shop),
    });
    expect(made.status).toBe(201);
  };
  await sendShop(fixture);
  const origin = `http://${slug}.localhost:${String(PAGE_CACHE_PORT)}`;
  if (language === 'en') {
    await page.context().addCookies([{ name: 'lytro-lang', value: 'en', url: origin }]);
  }
  return { slug, fixture, url: (path: string) => `${origin}${path}`, sendShop };
}

const purge = (...tags: string[]) =>
  redis.eval(CLEAR_PAGE_TAGS_SCRIPT, 1, PAGE_TAG_TIMES_KEY, PAGE_TAG_KEEP_MS, ...tags);

test.describe("a shop's pages kept in the storefront's Redis", () => {
  test('an English page is drawn once, then answered from the copy, and never handed to the edge', async ({
    page,
  }) => {
    const shop = await shopOf(page, 'en');
    const first = await page.goto(shop.url('/p/cotton-panjabi'));
    expect(first?.status()).toBe(200);
    expect(first?.headers()[CACHE]).toBe('miss');
    await expect(page.locator('h1').first()).toContainText('Cotton Panjabi');

    const again = await page.goto(shop.url('/p/cotton-panjabi?fbclid=IwAR0abc&v=x'));
    expect(again?.headers()[CACHE]).toBe('hit');
    // English is kept from no one at the edge: its cookie skips Cloudflare's cache, and the page says nothing to it.
    expect(again?.headers()[EDGE]).toBeUndefined();
    expect(again?.headers()['cache-control']).toMatch(/no-store/);
    await expect(page.locator('h1').first()).toContainText('Cotton Panjabi');
  });

  test("a seller's change shows once the server's purge reaches the page's tags, not before", async ({
    page,
  }) => {
    const shop = await shopOf(page, 'en');
    await page.goto(shop.url('/p/cotton-panjabi'));
    const renamed = structuredClone(shop.fixture);
    for (const each of renamed.products) {
      if (each.product.slug === 'cotton-panjabi') {
        each.product.name = 'Cotton Panjabi, eid edition';
        each.card.name = 'Cotton Panjabi, eid edition';
      }
    }
    await shop.sendShop(renamed);

    const kept = await page.goto(shop.url('/p/cotton-panjabi'));
    expect(kept?.headers()[CACHE]).toBe('hit');
    await expect(page.locator('h1').first()).not.toContainText('eid edition');

    await purge(`s:${shop.slug}`);
    const fresh = await page.goto(shop.url('/p/cotton-panjabi'));
    expect(fresh?.headers()[CACHE]).toBe('miss');
    await expect(page.locator('h1').first()).toContainText('Cotton Panjabi, eid edition');
  });

  test('a Bangla page on the Lytro address hands the edge only what is left of its time', async ({
    page,
  }) => {
    const shop = await shopOf(page, 'bn');
    const first = await page.goto(shop.url('/'));
    expect(first?.headers()[CACHE]).toBe('miss');
    expect(first?.headers()[EDGE]).toBe(
      'max-age=300, stale-while-revalidate=600, stale-if-error=86400',
    );
    const tags = (first?.headers()['cache-tag'] ?? '').split(',');
    expect(tags).toEqual(expect.arrayContaining(['lytro', `s:${shop.slug}`, `l:${shop.slug}`]));

    const again = await page.goto(shop.url('/'));
    expect(again?.headers()[CACHE]).toBe('hit');
    const left = Number(/^max-age=(\d+),/.exec(again?.headers()[EDGE] ?? '')?.[1]);
    expect(left).toBeGreaterThan(280);
    expect(left).toBeLessThanOrEqual(300);
    expect(again?.headers()['cache-tag']).toBe(first?.headers()['cache-tag']);
    // Bangla and English are kept apart.
    await page.context().addCookies([{ name: 'lytro-lang', value: 'en', url: shop.url('/') }]);
    expect((await page.goto(shop.url('/')))?.headers()[CACHE]).toBe('miss');
  });

  test('a page for one shopper, and the cart, are never kept', async ({ page }) => {
    const shop = await shopOf(page, 'en');
    await page
      .context()
      .addCookies([{ name: 'lytro-shopper', value: 'token', url: shop.url('/') }]);
    for (const path of ['/p/cotton-panjabi', '/p/cotton-panjabi', '/cart']) {
      const answer = await page.goto(shop.url(path));
      expect(answer?.headers()[CACHE], path).toBeUndefined();
    }
  });

  test("a kept English page still opens on the shopper's own link, chosen in the browser", async ({
    page,
  }) => {
    const shop = await shopOf(page, 'en', (slug) =>
      meghShop('en', { slug, products: [designed('en'), panjabi('en')] }),
    );
    await page.goto(shop.url('/p/irani-burka'));
    const linked = await page.goto(shop.url(`/p/irani-burka?v=${designedVariant(2, 'XL')}`));
    expect(linked?.headers()[CACHE]).toBe('hit');
    await expect(page.locator('.pcards .pcard').nth(1)).toHaveAttribute('aria-checked', 'true');
  });
});
