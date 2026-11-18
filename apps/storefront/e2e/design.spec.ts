import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StorefrontThemeKey } from '@lytronix/validators';
import { type Browser, expect, test } from '@playwright/test';
import { builderShop, type SketchShop } from './support/builder-fixtures';
import type { Language } from './support/fixtures';
import { GOOD_PREVIEW } from './support/mock-server';
import { openShop } from './support/shop';

// STOREFRONT-BUILDER-PLAN SB-8 to SB-12: the home a shop designs -- its theme and sections, each filling itself from the
// shop's data, the rows asking the server for the orders they show -- and its draft shown only through a preview link.
// The shops are the builder sketch's own sample shops (docs/brand/lytro-storefront-builder.html).

const SKETCH = pathToFileURL(
  resolve(__dirname, '../../../docs/brand/lytro-storefront-builder.html'),
).href;

/** The sketch's sample shops, read from the sketch itself. */
async function sketchShops(browser: Browser): Promise<Record<StorefrontThemeKey, SketchShop>> {
  const page = await browser.newPage();
  await page.goto(SKETCH);
  const shops = await page.evaluate<Record<StorefrontThemeKey, SketchShop>>('SHOPS');
  await page.close();
  return shops;
}

const AREA = {
  phone: { width: 370, height: 1900 },
  desktop: { width: 1280, height: 1600 },
} as const;
type Device = keyof typeof AREA;

test.describe('the designed home (SB-8 to SB-10)', () => {
  test('draws the sections in order, each row asking for what it shows', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Royal, shops.royal, language),
    );
    await page.goto(shop.url('/'));
    const home = page.locator('.sfb[data-theme="royal"]');
    await expect(home).toBeVisible();
    // The announcement writes itself from what is on sale.
    // First on the page, it sits over the header (SB-8).
    await expect(page.locator('.sfb-bar > .sb-ann')).toContainText('Up to 18% off on 3 products');
    await expect(home.locator('.sb-hero h1')).toHaveText('Discover your signature scent');
    await expect(home.locator('.sb-cat')).toHaveCount(shops.royal.cats.length);
    // Best sellers, most ordered first; then the biggest saving first.
    const rows = home.locator('.sb-sec:has(.sb-card)');
    await expect(rows.nth(0).locator('.sb-nm').first()).toHaveText('Oud Royale, 100 ml');
    await expect(rows.nth(1).locator('.sb-nm').first()).toHaveText('Oud Royale, 100 ml');
    await expect(home.locator('.sb-trust .sb-it')).toHaveCount(4);
    const asked = (await shop.sent()).listRequests;
    expect(asked).toContainEqual(expect.stringContaining('sort=best_selling'));
    expect(asked).toContainEqual(expect.stringContaining('onSale=true'));
    // Sold-out products leave a row.
    expect(asked.every((query) => query.includes('inStock=true'))).toBe(true);
  });

  test('gives each card its saving, its badges and what is left (SB-10, SB-21)', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Royal, shops.royal, language),
    );
    await page.goto(shop.url('/'));
    const oud = page.locator('.sb-card', { hasText: 'Oud Royale' }).first();
    await expect(oud.locator('.sb-tag.sb-sale')).toHaveText('−18%');
    await expect(oud.locator('.sb-tag.sb-best')).toHaveText('Best seller');
    await expect(oud.locator('.sb-pr s')).toHaveText('৳5,500');
    await expect(oud.locator('.sb-sold')).toHaveText('Ordered 64 times');
    await expect(oud).toHaveAttribute('href', '/p/oud-royale-100-ml');
  });

  test('lists what is on sale at /offers, the biggest saving first', async ({ page, browser }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Royal, shops.royal, language),
    );
    await page.goto(shop.url('/offers'));
    await expect(page.locator('h1.pt')).toHaveText('On sale');
    // SB-17: a designed shop's lists draw the theme's card.
    await expect(page.locator('.sfb-list .sb-card .sb-nm')).toHaveText([
      'Oud Royale, 100 ml',
      'Amber Attar, 12 ml',
      'Velvet gift box',
    ]);
  });
});

test.describe("every page in the theme's header, footer and card (SB-8, SB-17, SB-21)", () => {
  test("wears the theme's header and footer on an inner page, its links lit where the page is", async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Bold, shops.bold, language),
    );
    await page.goto(shop.url('/offers'));
    const header = page.locator('.sfb-bar .sb-hd.sb-bar');
    await expect(header).toBeVisible();
    await expect(header.locator('.sb-nav a.sb-on')).toHaveText('Offers');
    await expect(header.locator('.sb-nav a')).toHaveText([
      'All products',
      'Offers',
      ...shops.bold.cats.slice(0, 5).map((cat) => cat[1]),
    ]);
    // The storefront's own search and cart, in the theme's header.
    await header.locator('.sb-acct').waitFor();
    await expect(page.locator('.sfb-foot .sb-ft .sb-pbl')).toHaveText('Powered by Lytro');
    await expect(page.locator('.sfb-foot .sb-ft h3')).toContainText([
      'Shop',
      'Categories',
      'Contact',
    ]);
    // The old header and footer are gone.
    await expect(page.locator('.hdr')).toHaveCount(0);
    await expect(page.locator('footer.foot')).toHaveCount(0);
  });

  test('strikes the regular price through on the product page, with its saving', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) => {
      const made = builderShop(StorefrontThemeKey.Royal, shops.royal, language);
      // The product page reads the same facts its card does.
      for (const row of made.products ?? []) {
        row.product = {
          ...row.product,
          minRegularPrice: row.card.minRegularPrice ?? null,
          bestDiscount: row.card.bestDiscount ?? 0,
          variants: row.product.variants.map((variant) => ({
            ...variant,
            regularPrice: row.card.minRegularPrice ?? null,
          })),
        };
      }
      return made;
    });
    await page.goto(shop.url('/p/oud-royale-100-ml'));
    const row = page.locator('.pricerow').first();
    await expect(row.locator('.price')).toHaveText('৳4,500');
    await expect(row.locator('.unit')).toHaveText('৳5,500');
    await expect(row.locator('.st.sale')).toHaveText('18% off');
  });
});

test.describe("the draft's preview (SB-12)", () => {
  test('shows the draft only through a live link, never kept', async ({ page, browser }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) => {
      const live = builderShop(StorefrontThemeKey.Royal, shops.royal, language);
      const draft = builderShop(StorefrontThemeKey.Fresh, shops.fresh, language);
      return { ...live, draft: draft.info?.design };
    });
    const answer = await page.goto(shop.url(`/preview?t=${GOOD_PREVIEW}`));
    expect(answer?.headers()['cache-control']).toContain('no-store');
    await expect(page.locator('.sfb[data-theme="fresh"]')).toBeVisible();
    await expect(page.locator('.banner.preview')).toContainText("shoppers don't see this yet");

    // Shoppers still see the live design.
    await page.goto(shop.url('/'));
    await expect(page.locator('.sfb[data-theme="royal"]')).toBeVisible();

    // An ended or changed link says so, and shows nothing of the draft.
    await page.goto(shop.url('/preview?t=ended'));
    await expect(page.locator('h1')).toHaveText('Preview ended');
    await expect(page.locator('.sfb')).toHaveCount(0);
  });
});

// The built home beside the sketch's drawing of each theme, at the sketch's frame sizes, saved to test-results/compare
// for a person to compare (no pixel baseline: fonts render a little differently on each system).
test.describe('the designed home beside the builder sketch', () => {
  const themes = Object.values(StorefrontThemeKey);
  const devices: Device[] = ['phone', 'desktop'];
  const languages: Language[] = ['bn', 'en'];
  for (const theme of themes) {
    for (const device of devices) {
      for (const language of languages) {
        test(`${theme} on a ${device} in ${language}`, async ({ browser }) => {
          test.skip(test.info().project.name !== 'desktop', 'taken once, in the desktop project');
          const out = `test-results/compare/builder-${theme}-${device}-${language}`;
          const drawing = await browser.newPage({ viewport: { width: 1500, height: 2400 } });
          await drawing.goto(`${SKETCH}#${theme}/${device}/${language}/shot`);
          await drawing.waitForTimeout(600);
          await drawing
            .locator('.frame')
            .first()
            .screenshot({ path: `${out}-sketch.png` });
          const shops = await drawing.evaluate<Record<StorefrontThemeKey, SketchShop>>('SHOPS');
          await drawing.close();

          const context = await browser.newContext({
            viewport: AREA[device],
            serviceWorkers: 'block',
          });
          const app = await context.newPage();
          const shop = await openShop(
            app,
            (lang) => builderShop(theme, shops[theme], lang),
            language,
          );
          await app.goto(shop.url('/'));
          await app.waitForLoadState('networkidle');
          await app.evaluate(() => document.fonts.ready);
          await app.waitForTimeout(500);
          await app.screenshot({ path: `${out}-app.png`, fullPage: true });
          // The page scrolls inside its frame: its end, with the footer, as a second picture.
          await app.locator('.scroll').evaluate((scroll) => {
            scroll.scrollTop = scroll.scrollHeight;
          });
          await app.waitForTimeout(300);
          await app.screenshot({ path: `${out}-app-end.png` });
          await context.close();
        });
      }
    }
  }
});
