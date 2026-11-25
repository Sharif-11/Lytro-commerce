import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StorefrontThemeKey } from '@lytronix/validators';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { builderShop, type SketchShop } from './support/builder-fixtures';
import { type Language, makeProduct } from './support/fixtures';
import { openShop } from './support/shop';

// STOREFRONT-BUILDER-PLAN SB-32 (the owner, 2026-11-26: "we need to populate products in home page also, both
// categorized and uncategorized ... so that the website looks like a reputed page and busy shop"): every product on
// the home once -- no card twice, no automatic row short of its fill, the rest in "সব প্রোডাক্ট" -- the categories
// section showing only categories with a picture, and its strip moving by itself only when its tiles overflow.

const SKETCH = pathToFileURL(
  resolve(__dirname, '../../../docs/brand/lytro-storefront-builder.html'),
).href;

async function sketchShops(browser: Browser): Promise<Record<StorefrontThemeKey, SketchShop>> {
  const page = await browser.newPage();
  await page.goto(SKETCH);
  const shops = await page.evaluate<Record<StorefrontThemeKey, SketchShop>>('SHOPS');
  await page.close();
  return shops;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Studio sketch shop with `extra` more products added without a category (quick add's way), oldest last. */
function studioWith(sketch: SketchShop, extra: number) {
  return (language: Language) => {
    const made = builderShop(StorefrontThemeKey.Studio, sketch, language);
    const more = Array.from({ length: extra }, (_, at) =>
      makeProduct({
        id: `00000000-0000-4000-8000-${String(900 + at).padStart(12, '0')}`,
        slug: `shirt-${String(at + 1)}`,
        name: `Shirt ${String(at + 1)}`,
        price: 990 + at,
        createdAt: new Date(Date.now() - (90 + at) * DAY_MS).toISOString(),
      }),
    );
    const products = [...(made.products ?? []), ...more];
    return {
      ...made,
      products,
      info: { ...made.info, productCount: products.length },
    } as typeof made;
  };
}

/** Every card the home shows, by name, in page order. */
async function cardNames(page: Page): Promise<string[]> {
  return page.locator('.sfb .sb-sec .sb-card .sb-nm').allTextContents();
}

const allProducts = (page: Page) => page.locator('#all-products');

test.describe('every product on the home (SB-32)', () => {
  test('shows each product once, the rest in "সব প্রোডাক্ট", twelve at a time (ha-mixed, ha-more)', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, studioWith(shops.studio, 25));
    await page.goto(shop.url('/'));
    const all = allProducts(page);
    await expect(all.locator('h2')).toHaveText('All products· 30');
    await expect(all.locator('.sb-card')).toHaveCount(12);
    const first = await cardNames(page);
    expect(new Set(first).size).toBe(first.length);
    const more = all.locator('button.sb-more');
    await expect(more).toHaveText(`See ${String(30 - first.length)} more`);
    await more.click();
    await expect(all.locator('.sb-card')).toHaveCount(24);
    await more.click();
    // Every product once, and the button gone at the end of the list.
    await expect(more).toHaveCount(0);
    const every = await cardNames(page);
    expect(every).toHaveLength(30);
    expect(new Set(every).size).toBe(30);
  });

  test('a small shop shows each product once and no half-empty row (ha-small)', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, studioWith(shops.studio, 0));
    await page.goto(shop.url('/'));
    const every = await cardNames(page);
    expect([...every].sort()).toEqual(shops.studio.products.map((row) => row.n[1]).sort());
    // The on-sale carousel can't fill five once the newest four are shown: it leaves.
    await expect(page.locator('.sfb .sb-rail')).toHaveCount(0);
    await expect(allProducts(page).locator('button.sb-more')).toHaveCount(0);
  });

  test('a shop with no categories has no categories section, and its products all come on the home (ha-no-categories)', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) => ({
      ...studioWith(shops.studio, 13)(language),
      categories: [],
    }));
    await page.goto(shop.url('/'));
    await expect(page.locator('#categories')).toHaveCount(0);
    await expect(allProducts(page).locator('h2')).toHaveText('All products· 18');
    const first = await cardNames(page);
    expect(new Set(first).size).toBe(first.length);
    await allProducts(page).locator('button.sb-more').click();
    await expect.poll(async () => (await cardNames(page)).length).toBe(18);
  });
});

test.describe('the categories section (SB-32)', () => {
  test('leaves out a category with no picture, which the header chips keep', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) => {
      const made = studioWith(shops.studio, 0)(language);
      const categories = (made.categories ?? []).map((category, at) =>
        at === 1 ? { ...category, cover: null, image: null } : category,
      );
      return { ...made, categories };
    });
    await page.goto(shop.url('/'));
    const tiles = page.locator('#categories .sb-cat:not(.sb-copy)');
    await expect(tiles).toHaveCount(shops.studio.cats.length - 1);
    await expect(tiles.filter({ hasText: 'Kurti' })).toHaveCount(0);
    await expect(page.locator('.sb-nav a', { hasText: /^Kurti$/ })).toHaveCount(1);
  });

  test('has no section when no category has a picture', async ({ page, browser }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) => {
      const made = studioWith(shops.studio, 0)(language);
      return {
        ...made,
        categories: (made.categories ?? []).map((category) => ({
          ...category,
          cover: null,
          image: null,
        })),
      };
    });
    await page.goto(shop.url('/'));
    await expect(page.locator('.sfb .sb-hero').first()).toBeVisible();
    await expect(page.locator('#categories')).toHaveCount(0);
  });

  test('moves by itself when its tiles overflow the strip, and not when they fit or motion is reduced', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, studioWith(shops.studio, 0));
    const strip = page.locator('#categories .sb-cats');

    // A phone: six tall tiles run past the strip, so it moves on a tile within a few seconds.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(shop.url('/'));
    await expect(strip).toHaveAttribute('data-rotating', 'true');
    // The copies that loop it are hidden from screen readers and out of the tab order.
    await expect(strip.locator('.sb-copy').first()).toHaveAttribute('aria-hidden', 'true');
    await expect(strip.locator('.sb-copy').first()).toHaveAttribute('tabindex', '-1');
    await strip.scrollIntoViewIfNeeded();
    await expect
      .poll(() => strip.evaluate((element) => element.scrollLeft), { timeout: 10_000 })
      .toBeGreaterThan(0);

    // A computer: the tiles wrap and fit, so nothing moves and no copies are added.
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto(shop.url('/'));
    await expect(strip.locator('.sb-cat').first()).toBeVisible();
    await expect(strip).not.toHaveAttribute('data-rotating', 'true');
    await expect(strip.locator('.sb-copy')).toHaveCount(0);

    // Reduced motion: never moves.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(shop.url('/'));
    await expect(strip.locator('.sb-cat').first()).toBeVisible();
    await strip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3_600);
    expect(await strip.evaluate((element) => element.scrollLeft)).toBe(0);
    await expect(strip.locator('.sb-copy')).toHaveCount(0);
  });
});
