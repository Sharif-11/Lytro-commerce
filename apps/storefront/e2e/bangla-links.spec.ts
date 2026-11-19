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
      makeProduct({ id: 'organza', slug: SLUG, name: NAME, price: 1999, categoryId: CATEGORY.id }),
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

  test("leads a renamed product's old address to its new one", async ({ page }) => {
    const shop = await openBanglaShop(page);
    const answer = await page.goto(shop.url(`/p/${OLD_SLUG}`));
    expect(answer?.status()).toBe(200);
    expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/p/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  });
});
