import { expect, type Page, test } from '@playwright/test';
import { alertOn, fillOrderForm, hijabLine, openShop, seedCart } from './support/shop';

// STOREFRONT-DESIGN §7g, Slice 9.9 (the prototype's Part 99): orders that can't be placed for a few minutes (D9-14) --
// the banner at the top of the shop and at checkout, Place order waiting -- and the footer's Privacy link.

const CANT_ORDER =
  "Because of a problem, orders can't be placed in this shop for a few minutes. Please try again shortly.";
const place = (page: Page) => page.getByRole('button', { name: 'Place order · cash on delivery' });
const paused = (page: Page) =>
  page.getByRole('button', { name: 'Orders paused for a few minutes' });

/** What the server answers an order while changes can't be saved (9.2's SavingGuard). */
const SAVING_PAUSED = {
  refuse: {
    status: 503,
    code: 'service_unavailable',
    details: { savingPaused: true },
  },
};

test.describe("orders that can't be placed for a few minutes (D9-14)", () => {
  test('the shop says so at the top while the server does', async ({ page }) => {
    const shop = await openShop(page, () => ({ savingPaused: true }));
    await page.goto(shop.url('/'));
    await expect(page.getByText(CANT_ORDER)).toBeVisible();
  });

  test('checkout says so and Place order waits, then may be tried again', async ({ page }) => {
    await page.clock.install();
    const shop = await openShop(page, () => ({ savingPaused: true }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(page.getByText(CANT_ORDER)).toBeVisible();
    await expect(paused(page)).toBeDisabled();
    await expect(place(page)).toHaveCount(0);

    await page.clock.fastForward('00:31');
    await expect(place(page)).toBeEnabled();
    await expect(page.getByText(CANT_ORDER)).toHaveCount(0);
  });

  test('an order refused for it says so, keeps what was typed, and tries again with the same key', async ({
    page,
  }) => {
    await page.clock.install();
    const shop = await openShop(page, () => ({ nextOrders: [SAVING_PAUSED] }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await expect(page.getByText(CANT_ORDER)).toHaveCount(0);
    await fillOrderForm(page);
    const first = page.waitForRequest('**/api/orders');
    await place(page).click();
    const firstKey = (await first).headers()['idempotency-key'];
    await expect(alertOn(page)).toHaveText(CANT_ORDER);
    await expect(paused(page)).toBeDisabled();
    expect((await shop.sent()).orders).toHaveLength(0);

    await page.clock.fastForward('00:31');
    await expect(place(page)).toBeEnabled();
    const second = page.waitForRequest('**/api/orders');
    await place(page).click();
    expect((await second).headers()['idempotency-key']).toBe(firstKey);
    await page.waitForURL('**/order/**');
  });

  test("any other 503 isn't it: the order may not have arrived, so it says to try again", async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [{ refuse: { status: 503, code: 'service_unavailable' } }],
    }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await place(page).click();
    await expect(alertOn(page)).toBeVisible();
    await expect(page.getByText(CANT_ORDER)).toHaveCount(0);
    await expect(place(page)).toBeEnabled();
  });

  test('says it in Bangla', async ({ page }) => {
    const shop = await openShop(page, () => ({ savingPaused: true }), 'bn');
    await page.goto(shop.url('/'));
    await expect(
      page.getByText(
        'একটা সমস্যার কারণে কয়েক মিনিট এই শপে অর্ডার দেওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
      ),
    ).toBeVisible();
  });
});

test.describe('the footer', () => {
  test("links Lytro's privacy policy under the mark, in either language", async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/'));
    const link = page.locator('footer').getByRole('link', { name: 'Privacy' });
    await expect(link).toHaveAttribute('href', 'https://lytro.app/privacy');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByText(CANT_ORDER)).toHaveCount(0);

    const bangla = await openShop(page, () => ({}), 'bn');
    await page.goto(bangla.url('/'));
    await expect(page.locator('footer').getByRole('link', { name: 'প্রাইভেসি' })).toHaveAttribute(
      'href',
      'https://lytro.app/privacy',
    );
  });
});
