import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StorefrontThemeKey } from '@lytronix/validators';
import { type Browser, expect, type Page, test } from '@playwright/test';
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

/**
 * React's work after an event, done: it runs on a message-channel task, which the test's clock does not move, so a
 * message sent after it arrives once it is through.
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          resolve();
        };
        channel.port2.postMessage(null);
      }),
  );
}

/** BL-6: the sketch's one full-width banner (`ONE_BANNER`), read from the sketch. */
async function oneBannerOf(browser: Browser): Promise<SketchShop['oneBanner']> {
  const page = await browser.newPage();
  await page.goto(SKETCH);
  const banner = await page.evaluate<SketchShop['oneBanner']>('ONE_BANNER');
  await page.close();
  return banner;
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
    await expect(page.locator('.sfb-bar .sb-ann')).toContainText('Up to 18% off on 3 products');
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

test.describe('banner layouts, the bar and the hero tiles (BL-2 to BL-17)', () => {
  test('turns the bar two items at a time, leaves it as the page scrolls, and tracks orders from the header', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Royal, shops.royal, language),
    );
    // The bar's seconds are the test's to move: the clock stands still from before the page opens.
    const start = Date.now();
    await page.clock.install({ time: start });
    await page.clock.pauseAt(start + 1_000);
    await page.goto(shop.url('/'));
    // Every pair is in the page, in the seller's order; one shows, the next after 4 seconds.
    const pairs = page.locator('.sfb-bar .sb-ann .sb-fr');
    await expect(pairs).toHaveCount(2);
    await expect(pairs.nth(0)).toContainText('Cash on delivery');
    await expect(pairs.nth(0)).toContainText('Inside Dhaka city: delivery up to ৳70');
    await expect(pairs.nth(0)).toContainText('Outside Dhaka city: up to ৳130');
    await expect(pairs.nth(1)).toContainText('Up to 18% off on 3 products');
    await expect(pairs.nth(0)).toHaveClass(/sb-on/);
    // The cursor away from the bar (a browser's starts at the corner, on it).
    await page.mouse.move(200, 600);
    await page.clock.runFor(4_100);
    await expect(pairs.nth(1)).toHaveClass(/sb-on/);
    await expect(pairs.nth(0)).not.toHaveClass(/sb-on/);
    // A mouse resting on it holds it; moved away, it turns again (BL-16).
    // The mouse straight onto it: with the clock stopped, a hover's wait for a still frame would never end.
    const shown = await pairs.nth(1).boundingBox();
    if (!shown) throw new Error('the bar is on the page');
    await page.mouse.move(shown.x + shown.width / 2, shown.y + shown.height / 2);
    await settled(page);
    await page.clock.runFor(9_000);
    await expect(pairs.nth(1)).toHaveClass(/sb-on/);
    await page.mouse.move(200, 600);
    await settled(page);
    await page.clock.runFor(4_100);
    await expect(pairs.nth(0)).toHaveClass(/sb-on/);
    const wrap = page.locator('.sfb-bar .sb-ann-wrap');
    await page.locator('.scroll').evaluate((scroll) => {
      scroll.scrollTop = 600;
    });
    await expect(wrap).toHaveClass(/sb-gone/);
    await page.locator('.scroll').evaluate((scroll) => {
      scroll.scrollTop = 0;
    });
    await expect(wrap).not.toHaveClass(/sb-gone/);
    await expect(page.locator('.sfb-bar .sb-trk')).toHaveAttribute('href', '/track');
  });

  test('rotates the slide beside two tiles of the collections the seller picked', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const studio = {
      ...shops.studio,
      layout: shops.studio.layout.map((entry) => (entry === 'hero' ? 'hero-tiles' : entry)),
    };
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Studio, studio, language),
    );
    await page.goto(shop.url('/'));
    const hero = page.locator('.sb-hero.sb-auto');
    await expect(hero.locator('h1')).toHaveText('Embroidered panjabi');
    await expect(hero.locator('.sb-dots i')).toHaveCount(3);
    const tiles = hero.locator('.sb-tile');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.nth(0)).toHaveAttribute('href', '/offers');
    await expect(tiles.nth(0)).toContainText('Offers on');
    await expect(tiles.nth(1)).toHaveAttribute('href', '/new');
    await expect(tiles.nth(1)).toContainText('Just in');
    const asked = (await shop.sent()).listRequests;
    expect(asked).toContainEqual(expect.stringContaining('sort=newest'));
  });

  test('lays the banners out by their number, or as the seller picked', async ({
    page,
    browser,
  }) => {
    const shops = await sketchShops(browser);
    const oneBanner = await oneBannerOf(browser);
    const screen = {
      ...shops.studio,
      oneBanner,
      layout: ['header', 'banners-auto', 'banners', 'banners-one', 'banners-full', 'footer'],
    };
    const shop = await openShop(page, (language) =>
      builderShop(StorefrontThemeKey.Studio, screen, language),
    );
    await page.goto(shop.url('/'));
    const sections = page.locator('.sb-banners');
    await expect(sections).toHaveCount(4);
    // Three filling themselves: one big and two small; on a phone the small ones are compact tiles.
    await expect(sections.nth(0)).toHaveClass(/sb-big_two/);
    await expect(sections.nth(0).locator('.sb-ban')).toHaveCount(3);
    await expect(sections.nth(0).locator('.sb-ban.sb-c')).toHaveCount(2);
    await expect(sections.nth(0).locator('.sb-ban').nth(0)).toHaveAttribute('href', '/offers');
    await expect(sections.nth(1)).toHaveClass(/sb-side/);
    await expect(sections.nth(1).locator('.sb-ban.sb-c')).toHaveCount(2);
    await expect(sections.nth(2)).toHaveClass(/sb-full/);
    await expect(sections.nth(3)).toHaveClass(/sb-full/);
    await expect(sections.nth(3).locator('.sb-ban.sb-c')).toHaveCount(0);
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

  // BL-2 to BL-17: the sketch's shop screens for the bar, the header, the hero's tiles and the banner layouts.
  const screens = {
    'v-top': (shop: SketchShop) => ({
      ...shop,
      layout: shop.layout.map((entry) => (entry === 'hero' ? 'hero-tiles' : entry)),
    }),
    'v-banners': (shop: SketchShop, oneBanner: SketchShop['oneBanner']) => ({
      ...shop,
      oneBanner,
      layout: ['header', 'banners-auto', 'banners', 'banners-one', 'banners-full', 'footer'],
    }),
  } as const;
  for (const [name, screen] of Object.entries(screens)) {
    for (const device of devices) {
      for (const language of languages) {
        test(`${name} on a ${device} in ${language}`, async ({ browser }) => {
          test.skip(test.info().project.name !== 'desktop', 'taken once, in the desktop project');
          const out = `test-results/compare/builder-${name}-${device}-${language}`;
          const drawing = await browser.newPage({ viewport: { width: 1500, height: 2400 } });
          await drawing.goto(`${SKETCH}#${name}/${device}/${language}/shot`);
          await drawing.waitForTimeout(600);
          await drawing
            .locator('.frame')
            .first()
            .screenshot({ path: `${out}-sketch.png` });
          const shops = await drawing.evaluate<Record<StorefrontThemeKey, SketchShop>>('SHOPS');
          const oneBanner = await drawing.evaluate<SketchShop['oneBanner']>('ONE_BANNER');
          await drawing.close();

          const context = await browser.newContext({
            viewport: AREA[device],
            serviceWorkers: 'block',
          });
          const app = await context.newPage();
          const shop = await openShop(
            app,
            (lang) => builderShop(StorefrontThemeKey.Studio, screen(shops.studio, oneBanner), lang),
            language,
          );
          await app.goto(shop.url('/'));
          await app.waitForLoadState('networkidle');
          await app.evaluate(() => document.fonts.ready);
          await app.waitForTimeout(500);
          await app.screenshot({ path: `${out}-app.png`, fullPage: true });
          await context.close();
        });
      }
    }
  }
});
