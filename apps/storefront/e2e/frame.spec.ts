import { BrandCorners, BrandFont, BrandSpacing } from '@lytronix/validators';
import { expect, test } from '@playwright/test';
import { STOREFRONT_PORT } from './support/mock-server';
import { openShop } from './support/shop';

// KNOWN-GAPS §105: what only a rendered page can show -- one app serving two shops, the shop's root, a card's tags, the
// header and footer, a landing page's bare frame, Bangla first and the Powered by Lytro mark.

test.describe('one app, each shop its own (SFT-01, SFT-02, SFT-13)', () => {
  test('serves two shops by their hosts, each with its own name, products and colours', async ({
    page,
  }) => {
    const megh = await openShop(page);
    const rupa = await openShop(page, () => ({
      info: {
        name: 'Rupa Store',
        slug: 'rupa',
        metaPixelId: null,
        logo: null,
        contact: { phone: null, email: null, address: null },
        deliveryZones: [],
        brand: {
          version: '1',
          colors: {
            main: '#7a1f25',
            accent: '#c96a7a',
            background: '#fdf6ec',
            onMain: '#ffffff',
            onAccent: '#ffffff',
            text: '#10201f',
            mainText: '#7a1f25',
          },
          fonts: {
            heading: { id: BrandFont.NotoSansBengaliInter },
            body: { id: BrandFont.NotoSansBengaliInter },
          },
          corners: BrandCorners.Round,
          spacing: BrandSpacing.Airy,
          darkLogo: null,
          icon: null,
        },
      },
      products: [],
      categories: [],
    }));
    await page.goto(megh.url('/'));
    await expect(page.getByRole('heading', { name: 'Megh Fashion', level: 1 })).toBeVisible();
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('.frame')).not.toHaveAttribute('data-corners', 'round');

    await page.goto(rupa.url('/'));
    await expect(page.getByRole('heading', { name: 'Rupa Store', level: 1 })).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(0);
    await expect(page.locator('.frame')).toHaveAttribute('data-corners', 'round');
  });

  test("answers a shop's root with its home: its welcome, categories and newest products", async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/'));
    await expect(page.getByText('Welcome', { exact: true })).toBeVisible();
    await expect(page.locator('a.cat', { hasText: 'Panjabi' })).toHaveAttribute(
      'href',
      '/c/panjabi',
    );
    await expect(page.getByRole('heading', { name: 'Shop by category' })).toBeVisible();
    await expect(page.getByText('Cash on delivery').first()).toBeVisible();
  });

  test('a host with no shop says so', async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'lytro-lang',
        value: 'en',
        url: `http://nobody.localhost:${String(STOREFRONT_PORT)}`,
      },
    ]);
    await page.goto(`http://nobody.localhost:${String(STOREFRONT_PORT)}/`);
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
  });

  test('a closed shop names nobody, on every page (SFT-12, LIF-07)', async ({ page }) => {
    const shop = await openShop(page, () => ({ outcome: 'closed' }));
    for (const path of ['/', '/p/cotton-panjabi', '/l/cotton-panjabi', '/checkout', '/track']) {
      await page.goto(shop.url(path));
      await expect(page.getByRole('heading', { name: 'Back soon' })).toBeVisible();
      await expect(page.getByText('Megh Fashion')).toHaveCount(0);
    }
  });
});

test.describe('cards (SFT-03)', () => {
  test('tags a new product, a sold-out one, and shows a product page its stock', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/new'));
    const card = (name: string) => page.locator('.card', { hasText: name });
    await expect(card('Linen Shirt').locator('.tag')).toHaveText('New');
    await expect(card('Kids Frock').locator('.tag')).toHaveText('Sold out');
    await expect(card('Chiffon Hijab').locator('.tag')).toHaveCount(0);

    await page.goto(shop.url('/p/chiffon-hijab'));
    await expect(page.locator('.pricerow .st.ok')).toHaveText('In stock');
    await page.goto(shop.url('/p/kids-frock'));
    await expect(page.locator('.pricerow .st.out')).toHaveText('Sold out');
  });
});

test.describe('header and footer (SFT-13, SFT-21, TEN-18)', () => {
  test("the footer carries the shop's contact, its links and Powered by Lytro", async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/'));
    const footer = page.locator('footer.foot');
    await expect(footer.getByRole('link', { name: '01711-223344' })).toHaveAttribute(
      'href',
      'tel:01711-223344',
    );
    await expect(footer.getByRole('link', { name: 'hello@meghfashion.com' })).toBeVisible();
    await expect(footer.getByText('Shop 12, Rapa Plaza')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Track order' })).toHaveAttribute(
      'href',
      '/track',
    );
    await expect(footer.getByRole('link', { name: 'Categories' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Powered by Lytro' })).toHaveAttribute(
      'href',
      'https://lytro.app',
    );
    await expect(footer.locator('.pb svg')).toHaveAttribute('aria-label', /Powered by Lytro/);
  });

  test('a shop with no contact shows no contact block', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      info: {
        name: language === 'en' ? 'Quiet Shop' : 'Quiet Shop',
        slug: 'quiet',
        metaPixelId: null,
        logo: null,
        contact: { phone: null, email: null, address: null },
        deliveryZones: [],
        brand: null,
      },
    }));
    await page.goto(shop.url('/'));
    await expect(page.locator('footer.foot .contact')).toHaveCount(0);
    await expect(page.locator('footer.foot .fshop')).toContainText('Quiet Shop');
  });

  test('the header reaches the shop, search and the cart', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/'));
    await expect(page.locator('.hdr .shop .name')).toHaveText('Megh Fashion');
    await expect(page.locator('.hdr .shop .logo')).toHaveText('M');
    await page.getByRole('button', { name: 'Cart', exact: false }).first().click();
    await expect(page.getByRole('dialog', { name: 'Cart' })).toBeVisible();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });
});

test.describe('a landing page (LND-01, LND-02, LND-14)', () => {
  test('shows one product in a bare frame: no categories, no search, no cart', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await expect(page.getByRole('heading', { name: 'Cotton Panjabi', level: 1 })).toBeVisible();
    await expect(page.locator('.hdr.minimal')).toBeVisible();
    await expect(page.locator('.hdr nav')).toHaveCount(0);
    await expect(page.locator('.hdr').getByRole('button', { name: 'Cart' })).toHaveCount(0);
    await expect(page.locator('.hdr').getByRole('link')).toHaveCount(0);
    await expect(
      page.locator('footer.foot').getByRole('link', { name: 'Browse the whole shop' }),
    ).toBeVisible();
    await expect(page.locator('footer.foot').getByRole('link', { name: 'Categories' })).toHaveCount(
      0,
    );
    await expect(page.locator('footer.foot .pb svg')).toHaveAttribute(
      'aria-label',
      /Powered by Lytro/,
    );
  });

  test('keeps working with the storefront off, which answers everywhere else with not-found', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({ storefrontEnabled: false }));
    const landing = await page.goto(shop.url('/l/cotton-panjabi'));
    expect(landing?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Cotton Panjabi', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse the whole shop' })).toHaveCount(0);
    for (const path of ['/', '/p/cotton-panjabi', '/checkout']) {
      const answer = await page.goto(shop.url(path));
      expect(answer?.status(), path).toBe(404);
    }
  });

  test('a product gone answers 404 with the branded page (LND-03)', async ({ page }) => {
    const shop = await openShop(page);
    const answer = await page.goto(shop.url('/l/old-panjabi'));
    expect(answer?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'This product is no longer available' }),
    ).toBeVisible();
  });
});

test.describe('Bangla first (I18N-01, LND-14)', () => {
  test('a new visitor reads Bangla; English sticks once chosen', async ({ page }) => {
    const shop = await openShop(page, () => ({}), 'bn');
    await page.goto(shop.url('/l/cotton-panjabi'));
    await expect(page.locator('.frame')).toHaveAttribute('lang', 'bn');
    await expect(page.getByRole('button', { name: 'অর্ডার কনফার্ম করুন' })).toBeVisible();
    await page.locator('.hdr .langpill').click();
    await expect(page.locator('.frame')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Confirm order' })).toBeVisible();
    await page.reload();
    await expect(page.locator('.frame')).toHaveAttribute('lang', 'en');
  });
});
