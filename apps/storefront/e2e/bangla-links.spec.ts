import { expect, type Page, test } from '@playwright/test';
import type { PublicCategory } from '../src/lib/api/storefront-api';
import { makeProduct } from './support/fixtures';
import { openShop } from './support/shop';

// A product or category named in Bangla has a Bangla slug, and so a Bangla address. Next hands the page that segment
// still percent-encoded, and every such page answered 404 until the slug was decoded once (staging, 2026-11-19): the
// API was asked for it encoded twice. The mock server decodes the path once, as the API does.

const SLUG = 'অর্গানজা-পার্টি-শাড়ি';
const NAME = 'অর্গানজা পার্টি শাড়ি';
const OLD_SLUG = 'পুরোনো-শাড়ি';
const ID = 'organza';
// Its ID is its slug, as the fixtures' categories have it: the mock lists a category's products by the slug asked.
const CATEGORY: PublicCategory = {
  id: 'শাড়ি-ও-ড্রেস',
  slug: 'শাড়ি-ও-ড্রেস',
  name: 'শাড়ি ও ড্রেস',
  image: null,
  productCount: 1,
  children: [],
};

/** A shop whose one product and one category are named in Bangla, and whose product was renamed once. */
const openBanglaShop = (page: Page) =>
  openShop(page, () => ({
    categories: [CATEGORY],
    products: [
      makeProduct({ id: ID, slug: SLUG, name: NAME, price: 1999, categoryId: CATEGORY.id }),
    ],
    moved: { [OLD_SLUG]: SLUG },
  }));

test.describe('a Bangla address', () => {
  test("opens the product's page", async ({ page }) => {
    const shop = await openBanglaShop(page);
    const answer = await page.goto(shop.url(`/p/${SLUG}`));
    expect(answer?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  });

  test("opens the product's landing page", async ({ page }) => {
    const shop = await openBanglaShop(page);
    const answer = await page.goto(shop.url(`/l/${SLUG}`));
    expect(answer?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  });

  test("opens the category's page, with its product", async ({ page }) => {
    const shop = await openBanglaShop(page);
    const answer = await page.goto(shop.url(`/c/${CATEGORY.slug}`));
    expect(answer?.status()).toBe(200);
    await expect(page.getByText(NAME).first()).toBeVisible();
  });

  test("leads a renamed product's old address to its ID's", async ({ page }) => {
    const shop = await openBanglaShop(page);
    const answer = await page.goto(shop.url(`/p/${OLD_SLUG}`));
    expect(answer?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/p/${ID}`);
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  });
});

// The owner, 2026-11-25: a Bangla name's slug made a very long link, so every link names the product by its ID; a link
// made by its slug before, current or old, still opens, led there for good with its whole query.
test.describe("a product's link by its ID", () => {
  test('a slug link is led for good to the ID link, its query kept', async ({ page }) => {
    const shop = await openBanglaShop(page);
    const query = '?v=organza-v&d=organza-d&fbclid=IwAR0abc';
    for (const [from, to] of [
      [`/p/${SLUG}`, `/p/${ID}`],
      [`/l/${SLUG}`, `/l/${ID}`],
      [`/l/${OLD_SLUG}`, `/l/${ID}`],
    ] as const) {
      const answer = await page.goto(shop.url(`${from}${query}`));
      const redirect = await answer?.request().redirectedFrom()?.response();
      expect(redirect?.status(), from).toBe(308);
      expect(page.url(), from).toBe(shop.url(`${to}${query}`));
      expect(answer?.status(), from).toBe(200);
    }
  });

  test('opens at its ID link without a redirect, which its preview and canonical name', async ({
    page,
  }) => {
    const shop = await openBanglaShop(page);
    for (const path of [`/p/${ID}`, `/l/${ID}`]) {
      const answer = await page.goto(shop.url(path));
      expect(answer?.request().redirectedFrom(), path).toBeNull();
      expect(answer?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
      for (const selector of ['link[rel="canonical"]', 'meta[property="og:url"]']) {
        const value =
          (await page
            .locator(selector)
            .getAttribute(selector.startsWith('link') ? 'href' : 'content')) ?? '';
        expect(new URL(value).pathname, `${path} ${selector}`).toBe(path);
      }
    }
  });

  test("a card, the cart's line and the share link name the product by its ID", async ({
    page,
  }) => {
    const shop = await openBanglaShop(page);
    await page.goto(shop.url(`/c/${CATEGORY.slug}`));
    const card = page.locator(`a[href^="/p/"]`, { hasText: NAME }).first();
    await expect(card).toHaveAttribute('href', `/p/${ID}`);
    const links = await page
      .locator('a[href^="/p/"], a[href^="/l/"]')
      .evaluateAll((all) => all.map((each) => each.getAttribute('href') ?? ''));
    for (const href of links) expect(decodeURIComponent(href)).not.toContain(SLUG);
  });
});
