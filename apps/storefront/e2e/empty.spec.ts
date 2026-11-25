import {
  StockState,
  startingDesign,
  StorefrontSectionKind,
  StorefrontThemeKey,
} from '@lytronix/validators';
import { expect, test } from '@playwright/test';
import type { PublicStorefrontDesign } from '../src/lib/api/storefront-api';
import { type Language, meghShop, type ShopFixture } from './support/fixtures';
import { openShop } from './support/shop';

// STOREFRONT-BUILDER-PLAN SB-33 (the owner, 2026-11-26): every page a shopper can land on with no products says so in
// one line and leads on -- to more of the shop's products, or, in a shop with none yet, to the ways of reaching it.

/** The starting page of a shop that has never saved its own (SB-11), as the server sends it. */
function starting(
  sections = startingDesign(StorefrontThemeKey.Studio).sections,
): PublicStorefrontDesign {
  return {
    theme: StorefrontThemeKey.Studio,
    palette: 0,
    sections,
    images: {},
    categories: [],
    products: [],
    preview: false,
  };
}

/** Megh on its starting page, with what a test changes. */
function designedMegh(change: (base: ShopFixture) => Partial<ShopFixture> = () => ({})) {
  return (language: Language): Partial<ShopFixture> => {
    const base = meghShop(language);
    const changed = change(base);
    return { ...changed, info: { ...(changed.info ?? base.info), design: starting() } };
  };
}

const NO_PRODUCTS = designedMegh(() => ({ products: [] }));

test.describe('a shop with no product yet (em-home-empty)', () => {
  test('its home says the collection is coming, with every way to reach it', async ({ page }) => {
    const shop = await openShop(page, NO_PRODUCTS);
    await page.goto(shop.url('/'));
    const band = page.locator('.sb-em-hero');
    await expect(band).toContainText('New collection coming soon');
    await expect(band.getByRole('heading', { level: 1 })).toHaveText('Megh Fashion');
    const card = page.locator('.sb-em-card');
    await expect(card.getByRole('heading', { name: 'Looking for something?' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Message on WhatsApp' })).toHaveAttribute(
      'href',
      /wa\.me/,
    );
    await expect(card.getByRole('link', { name: 'Messenger' })).toHaveAttribute(
      'href',
      /m\.me\/meghfashion/,
    );
    await expect(card.getByRole('link', { name: 'Call' })).toHaveAttribute('href', /^tel:/);
    await expect(card.getByRole('link', { name: 'See our Facebook page' })).toHaveAttribute(
      'href',
      'https://www.facebook.com/meghfashion',
    );
    // No section that would draw nothing: no hero, no rows, no empty heading; the trust strip stays.
    await expect(page.locator('.sb-hero, .sb-card, .sb-cats')).toHaveCount(0);
    await expect(page.locator('.sfb .sb-trust')).toBeVisible();
  });

  test("a pay-as-you-go shop's offers only its Facebook page; with none, come back soon", async ({
    page,
  }) => {
    const hidden = { phone: null, email: null, whatsapp: null, messenger: null };
    const payg = await openShop(
      page,
      designedMegh((base) => ({
        products: [],
        info: { ...base.info, contact: { ...base.info.contact, ...hidden } },
      })),
    );
    await page.goto(payg.url('/'));
    const card = page.locator('.sb-em-card');
    await expect(card).toContainText('news of the new collection on our Facebook page');
    await expect(card.getByRole('link')).toHaveCount(1);
    await expect(card.getByRole('link', { name: 'See our Facebook page' })).toHaveClass(
      /sb-em-pri/,
    );

    const none = await openShop(
      page,
      designedMegh((base) => ({
        products: [],
        info: {
          ...base.info,
          contact: { ...base.info.contact, ...hidden, facebookPage: null },
        },
      })),
    );
    await page.goto(none.url('/'));
    await expect(page.locator('.sb-em-card')).toContainText('Come back soon');
    await expect(page.locator('.sb-em-card').getByRole('link')).toHaveCount(0);
  });

  test('all products says the same, without the stock switch', async ({ page }) => {
    const shop = await openShop(page, NO_PRODUCTS);
    await page.goto(shop.url('/new'));
    await expect(page.getByRole('heading', { name: 'New collection coming soon' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Message on WhatsApp' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'In stock only' })).toHaveCount(0);
    await expect(page.getByText('Nothing found')).toHaveCount(0);
  });

  test('a home with products but no product row is not taken for an empty shop', async ({
    page,
  }) => {
    const trustOnly = starting(
      startingDesign(StorefrontThemeKey.Studio).sections.filter(
        (section) => section.kind === StorefrontSectionKind.Trust,
      ),
    );
    const shop = await openShop(page, (language) => {
      const base = meghShop(language);
      return { info: { ...base.info, design: trustOnly } };
    });
    await page.goto(shop.url('/'));
    await expect(page.locator('.sfb .sb-trust')).toBeVisible();
    await expect(page.locator('.sb-em-hero')).toHaveCount(0);
  });
});

test.describe('lists with nothing to show (SB-33)', () => {
  test('"In stock only" that empties a list says so, and lifts the filter', async ({ page }) => {
    const shop = await openShop(
      page,
      designedMegh((base) => ({
        products: base.products.map((row) => ({
          ...row,
          card: { ...row.card, stockState: StockState.Out },
        })),
      })),
    );
    await page.goto(shop.url('/new?stock=in'));
    await expect(page.getByRole('heading', { name: 'Nothing in stock right now' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See them all' })).toHaveAttribute('href', '/new');
  });

  test('an empty category leaves the chips and footer, and its page offers 4 more', async ({
    page,
  }) => {
    const shop = await openShop(
      page,
      designedMegh((base) => ({
        categories: [
          ...base.categories,
          { id: 'empty', slug: 'empty', name: 'Empty', image: null, productCount: 0, children: [] },
        ],
      })),
    );
    await page.goto(shop.url('/'));
    // The header's chips (and the menu, from the same list) and the footer; the home's own category tiles are SB-32's.
    await expect(page.locator('.sfb-bar a[href="/c/panjabi"]').first()).toBeAttached();
    await expect(
      page.locator('.sfb-bar a[href="/c/empty"], .sfb-foot a[href="/c/empty"]'),
    ).toHaveCount(0);

    const answer = await page.goto(shop.url('/c/empty'));
    expect(answer?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'New products for this category are coming soon' }),
    ).toBeVisible();
    const more = page.locator('.sb-em-more');
    await expect(more.getByRole('heading', { name: 'More from this shop' })).toBeVisible();
    await expect(more.locator('.sb-card')).toHaveCount(4);
    await expect(more.getByRole('link', { name: 'See every product' })).toHaveAttribute(
      'href',
      '/new',
    );
  });

  test('a search that finds nothing names the words, the categories and the most ordered', async ({
    page,
  }) => {
    const shop = await openShop(
      page,
      designedMegh((base) => ({
        categories: [
          ...base.categories,
          { id: 'empty', slug: 'empty', name: 'Empty', image: null, productCount: 0, children: [] },
        ],
      })),
    );
    await page.goto(shop.url('/search?q=zzqx'));
    await expect(page.getByRole('heading', { name: 'Nothing found for “zzqx”' })).toBeVisible();
    const chips = page.locator('.sb-em-chips a');
    await expect(chips.first()).toHaveAttribute('href', '/c/panjabi');
    await expect(page.locator('.sb-em-chips a[href="/c/empty"]')).toHaveCount(0);
    const more = page.locator('.sb-em-more');
    await expect(more.getByRole('heading', { name: 'Popular products' })).toBeVisible();
    await expect(more.locator('.sb-card')).toHaveCount(4);
  });

  test('the offers page with nothing on sale offers the newest instead', async ({ page }) => {
    const shop = await openShop(
      page,
      designedMegh((base) => ({
        products: base.products.map((row) => ({
          ...row,
          card: { ...row.card, bestDiscount: 0, minRegularPrice: null },
        })),
      })),
    );
    await page.goto(shop.url('/offers'));
    await expect(page.getByRole('heading', { name: 'No offers running right now' })).toBeVisible();
    await expect(
      page.locator('.sb-em-more').getByRole('heading', { name: 'New arrivals' }),
    ).toBeVisible();
    await expect(page.locator('.sb-em-more .sb-card')).toHaveCount(4);
    await expect(page.getByRole('link', { name: 'In stock only' })).toHaveCount(0);
  });
});

test.describe('a gone product (em-product-gone)', () => {
  test("answers 404 in the shop's own frame, with 4 more of its products", async ({ page }) => {
    const shop = await openShop(page, designedMegh());
    const answer = await page.goto(shop.url('/p/a-product-long-gone'));
    expect(answer?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: "This product isn't available any more" }),
    ).toBeVisible();
    await expect(page.locator('.sfb-bar')).toBeVisible();
    await expect(page.locator('.sb-em-more .sb-card')).toHaveCount(4);
  });

  test('with the storefront off, a landing link stays the bare page', async ({ page }) => {
    const shop = await openShop(page, () => ({ storefrontEnabled: false }));
    const answer = await page.goto(shop.url('/l/a-product-long-gone'));
    expect(answer?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: "This product isn't available any more" }),
    ).toBeVisible();
    await expect(page.locator('.sfb-bar, .sb-em-more')).toHaveCount(0);
  });
});
