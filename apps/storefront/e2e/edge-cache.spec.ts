import { expect, test } from '@playwright/test';
import { designed, designedVariant, designPhoto, panjabi, THANA } from './support/fixtures';
import { openShop, seedArea } from './support/shop';

// Slice 9.10, D9-32: a shop's pages Cloudflare's edge keeps. A page every shopper sees alike -- not signed in, in
// Bangla, on the shop's Lytro address -- carries the edge's lifetime and the tags the server's purges name it by, and
// nothing a shopper could tell apart; a busy server's page is a 503 the edge never keeps; a page for one shopper is kept
// nowhere; the shopper's own `?v=` link and area are applied in the browser, and one product's charge is asked in the
// form the edge keeps. The tests read the headers the storefront sends; Cloudflare itself is proven on the server.

const PRODUCT = '/v1/catalogue/products/cotton-panjabi';
const EDGE = 'cloudflare-cdn-cache-control';
const tagsOf = (headers: Record<string, string>) => (headers['cache-tag'] ?? '').split(',');

test.describe("a shop's pages kept at the edge", () => {
  test('a product page carries the lifetime and its tags, whatever its query, and no mark', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({}), 'bn');
    const answer = await page.goto(shop.url('/p/cotton-panjabi?fbclid=IwAR0abc'));
    expect(answer?.status()).toBe(200);
    const headers = answer?.headers() ?? {};
    expect(headers[EDGE]).toBe('max-age=300, stale-while-revalidate=600, stale-if-error=86400');
    expect(tagsOf(headers)).toEqual(
      expect.arrayContaining(['lytro', `s:${shop.slug}`, 'p:panjabi']),
    );
    // A product page lists no new product, so a new one leaves it be.
    expect(tagsOf(headers)).not.toContain(`l:${shop.slug}`);
    // Browsers keep nothing, since a purge can't reach them.
    expect(headers['cache-control']).toMatch(/no-store/);
    // The page's own mark names the same tags, and nothing a shopper can't see.
    await expect(page.locator('meta[name="lytro-edge"]')).toHaveAttribute(
      'content',
      new RegExp(`^tags lytro s:${shop.slug} p:panjabi`),
    );
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('the home, new arrivals and a search list products, so a new one clears them too', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({}), 'bn');
    for (const [path, lifetime] of [
      ['/', 'max-age=300'],
      ['/new', 'max-age=300'],
      ['/search?q=panjabi', 'max-age=60'],
    ] as const) {
      const answer = await page.goto(shop.url(path));
      const headers = answer?.headers() ?? {};
      expect(headers[EDGE], path).toMatch(new RegExp(`^${lifetime},`));
      expect(tagsOf(headers), path).toEqual(
        expect.arrayContaining(['lytro', `s:${shop.slug}`, `l:${shop.slug}`]),
      );
    }
  });

  test('a page for one shopper is kept nowhere: in English, or signed in', async ({ page }) => {
    const english = await openShop(page);
    const answer = await page.goto(english.url('/p/cotton-panjabi'));
    expect(answer?.status()).toBe(200);
    expect(answer?.headers()[EDGE]).toBeUndefined();

    const bangla = await openShop(page, () => ({}), 'bn');
    await page
      .context()
      .addCookies([{ name: 'lytro-shopper', value: 'token', url: bangla.url('/') }]);
    const signedIn = await page.goto(bangla.url('/p/cotton-panjabi'));
    expect(signedIn?.headers()[EDGE]).toBeUndefined();
    const cart = await page.goto(bangla.url('/cart'));
    expect(cart?.headers()[EDGE]).toBeUndefined();
  });

  test("a busy server's page is a 503 with its wait, which the edge never keeps", async ({
    page,
  }) => {
    const shop = await openShop(
      page,
      () => ({ refusals: [{ path: PRODUCT, status: 429, retryAfter: 12 }] }),
      'bn',
    );
    const answer = await page.goto(shop.url('/p/cotton-panjabi'));
    expect(answer?.status()).toBe(503);
    expect(answer?.headers()['retry-after']).toBe('12');
    expect(answer?.headers()[EDGE]).toBeUndefined();
    await expect(page.getByRole('heading', { name: 'শপটি এই মুহূর্তে খুব ব্যস্ত' })).toBeVisible();
  });

  test("the shopper's own link and area are applied in the browser, and the charge is asked as the edge keeps it", async ({
    page,
  }) => {
    const shop = await openShop(
      page,
      (language) => ({ products: [designed(language), panjabi(language)] }),
      'bn',
    );
    await seedArea(page, shop, THANA.mirpur);
    const asked = page.waitForResponse(
      (response) => response.url().includes('/api/estimate?') && response.url().includes('a='),
    );
    const answer = await page.goto(shop.url(`/p/irani-burka?v=${designedVariant(2, 'XL')}`));
    // The page as every shopper gets it opens on no design and no area...
    expect(answer?.headers()[EDGE]).toMatch(/^max-age=300,/);
    // ...and this shopper's link chooses the design and size, the gallery on its cover.
    const cards = page.locator('.pcards .pcard');
    await expect(cards.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(
      page
        .locator('.buy .vals[aria-label="সাইজ"]')
        .getByRole('button', { name: 'XL', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.gallery .main img')).toHaveAttribute('src', designPhoto(1));

    const charge = await asked;
    expect(charge.request().method()).toBe('GET');
    expect(charge.status()).toBe(200);
    expect(charge.headers()[EDGE]).toMatch(/^max-age=300,/);
    expect(tagsOf(charge.headers())).toEqual(
      expect.arrayContaining([
        'lytro',
        `s:${shop.slug}`,
        `p:${shop.fixture.products[0]?.product.id ?? ''}`,
      ]),
    );
    // The one product page (SB-31): the shopper's area is the order form's, its charge the summary's.
    await expect(page.locator('.sum .r', { hasText: 'ঢাকা শহর' })).toContainText('ডেলিভারি');
  });
});
