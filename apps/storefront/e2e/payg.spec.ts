import { expect, type Page, test } from '@playwright/test';
import { meghShop, trackedOrder } from './support/fixtures';
import { openShop } from './support/shop';

// PAYG-FAIR-USE-PLAN (the sketch's `pf-paused` and `pf-product`): a pay-as-you-go storefront waiting for its first
// top-up shows the paused page on every page but tracking (PF-13, PF-35, PFQ-2), never indexed; a pay-as-you-go shop's
// pages carry no direct contact -- the server sends its phone, email, WhatsApp and Messenger as null -- and keep its
// address and Facebook page (PF-15, PF-40, PFQ-4).

const pausedHeading = (page: Page) => page.getByRole('heading', { name: 'Back soon' });
const robots = (page: Page) => page.locator('meta[name="robots"]');

test.describe('a paused pay-as-you-go storefront (pf-paused)', () => {
  test("shows the shop's mark and name, that it is back soon, and is never indexed", async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      info: { ...meghShop(language).info, paused: true },
    }));
    for (const path of ['/', '/p/cotton-panjabi', '/c/panjabi', '/checkout']) {
      await page.goto(shop.url(path));
      await expect(pausedHeading(page)).toBeVisible();
      await expect(
        page.getByText(
          "Megh Fashion isn't taking orders for a little while. Please look again later.",
        ),
      ).toBeVisible();
      await expect(page.locator('.hdr .name')).toHaveText('Megh Fashion');
      await expect(page.locator('.hdr .logo')).toHaveText('M');
      await expect(robots(page)).toHaveCount(1);
      await expect(robots(page)).toHaveAttribute('content', 'noindex');
    }
  });

  test('still tracks an order already placed (PFQ-2)', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      info: { ...meghShop(language).info, paused: true },
    }));
    await page.goto(shop.url('/track'));
    await expect(page.getByText('Enter the tracking ID you got when you ordered.')).toBeVisible();
    await expect(pausedHeading(page)).toHaveCount(0);
  });

  test('says it in Bangla', async ({ page }) => {
    const shop = await openShop(
      page,
      (language) => ({ info: { ...meghShop(language).info, paused: true } }),
      'bn',
    );
    await page.goto(shop.url('/'));
    await expect(page.getByRole('heading', { name: 'শিগগিরই আবার চালু হচ্ছে' })).toBeVisible();
    await expect(
      page.getByText('মেঘ ফ্যাশন কিছুক্ষণের জন্য অর্ডার নিচ্ছে না। একটু পরে আবার দেখুন।'),
    ).toBeVisible();
  });
});

test.describe("a pay-as-you-go shop's pages without direct contact (pf-product)", () => {
  test('show no WhatsApp, Messenger, phone or email, and keep the address and the Facebook page', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => {
      const info = meghShop(language).info;
      return {
        info: {
          ...info,
          contact: {
            ...info.contact,
            phone: null,
            email: null,
            whatsapp: null,
            messenger: null,
          },
        },
      };
    });
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.locator('.pricerow')).toBeVisible();
    await expect(page.locator('.ask')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href*="wa.me/88"]')).toHaveCount(0);
    await expect(page.locator('a[href*="m.me/"]')).toHaveCount(0);
    await expect(page.getByText('Shop 12, Rapa Plaza, Dhanmondi, Dhaka').first()).toBeAttached();
    await expect(
      page.locator('a[href="https://www.facebook.com/meghfashion"]').first(),
    ).toBeAttached();

    await page.goto(shop.url('/sign-in'));
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });
});

test.describe("a pay-as-you-go order's tracking (PFQ-5)", () => {
  test("shows the shop's phone once the seller has seen the shopper's, and not before", async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => {
      const info = meghShop(language).info;
      return {
        info: {
          ...info,
          contact: { ...info.contact, phone: null, email: null, whatsapp: null, messenger: null },
        },
        tracked: {
          // The server sends the shop's phone only once the seller has seen the shopper's.
          K7F2M9QX: { ...trackedOrder(language, 'confirmed'), shopPhone: '01811112222' },
          L8G3N4RY: { ...trackedOrder(language, 'placed'), shopPhone: null },
        },
      };
    });
    await page.goto(shop.url('/track/K7F2M9QX'));
    await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
    await expect(page.locator('a[href="tel:01811112222"]').first()).toBeVisible();

    await page.goto(shop.url('/track/L8G3N4RY'));
    await expect(page.locator('.tl .s').first()).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });
});
