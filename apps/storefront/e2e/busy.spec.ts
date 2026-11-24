import { expect, type Page, type Response, test } from '@playwright/test';
import { rumana, THANA } from './support/fixtures';
import { openShop, seedArea, signIn } from './support/shop';

// STOREFRONT-DESIGN §7h, Slice 9.10 (the prototype's Part 910): a page the server is too busy to give (429, RTE-06, or
// 503) says so the way the offline page does and loads itself again after the server's wait; a delivery charge the
// server was too busy to work out says so in its place, with Try again; any other fault keeps the error page.

const PRODUCT = '/v1/catalogue/products/cotton-panjabi';
const ESTIMATE = '/v1/delivery-estimate';

const busyHeading = (page: Page) =>
  page.getByRole('heading', { name: 'The shop is very busy right now' });
const robots = (page: Page) => page.locator('meta[name="robots"]');
// The line that starts with the charge's name; "Cash on delivery" is another line's.
const deliveryLine = (page: Page) => page.locator('.line', { hasText: /^Delivery/ });
// A page's charge, asked by GET with its query since Slice 9.10's edge cache, or a cart's by POST.
const isEstimate = (response: Response) => new URL(response.url()).pathname === '/api/estimate';

test.describe('a page the shop is too busy to give (p910-busy)', () => {
  test("says so with the shop's mark, Try again and the server's wait, and is never indexed", async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({
      refusals: [{ path: PRODUCT, status: 429, retryAfter: 12 }],
    }));
    const answer = await page.goto(shop.url('/p/cotton-panjabi'));
    expect(answer?.status()).toBe(200);
    await expect(busyHeading(page)).toBeVisible();
    await expect(
      page.getByText('Please try again in a minute. Anything in your cart stays there.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(
      page.getByText(/^The page tries again by itself in 1[0-2] seconds$/),
    ).toBeVisible();
    // Megh Fashion's mark, its first letter, as it has no logo.
    await expect(page.locator('.bare .logo')).toHaveText('M');
    // Powered by Lytro, as the offline page carries it, sized as the footer's (small fixes, 2026-11-17).
    const mark = page.locator('.bare svg[aria-label="Powered by Lytro"]');
    await expect(mark).toBeVisible();
    expect((await mark.boundingBox())?.height).toBe(16);
    await expect(robots(page)).toHaveCount(1);
    await expect(robots(page)).toHaveAttribute('content', 'noindex');
  });

  test('counts down the wait and loads the page again by itself, which then shows', async ({
    page,
  }) => {
    // The clock held still, so the countdown moves only as the test moves it.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1_000);
    const shop = await openShop(page, () => ({
      refusals: [{ path: PRODUCT, status: 503, retryAfter: 5 }],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.getByText('The page tries again by itself in 5 seconds')).toBeVisible();
    await page.clock.fastForward('00:02');
    await expect(page.getByText('The page tries again by itself in 3 seconds')).toBeVisible();

    await shop.refuse([]);
    const reloaded = page.waitForEvent('load');
    await page.clock.fastForward('00:04');
    await reloaded;
    await expect(page.locator('.pricerow')).toBeVisible();
    await expect(busyHeading(page)).toHaveCount(0);
  });

  test('Try again loads the same page at once', async ({ page }) => {
    const shop = await openShop(page, () => ({ refusals: [{ path: PRODUCT, status: 429 }] }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.getByText('The page tries again by itself in 30 seconds')).toBeVisible();
    await shop.refuse([]);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('.pricerow')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/p/cotton-panjabi');
  });

  test('says it in Bangla, the wait in Bangla digits', async ({ page }) => {
    const shop = await openShop(page, () => ({ refusals: [{ path: PRODUCT, status: 429 }] }), 'bn');
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.getByRole('heading', { name: 'শপটি এই মুহূর্তে খুব ব্যস্ত' })).toBeVisible();
    await expect(
      page.getByText('এক মিনিট পরে আবার চেষ্টা করুন। আপনার কার্টে রাখা জিনিস ঠিক থাকবে।'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeVisible();
    await expect(page.getByText('৩০ সেকেন্ড পরে পেজটি নিজেই আবার খুলবে')).toBeVisible();
  });

  test("a shop the server is too busy to read shows no mark it doesn't know", async ({ page }) => {
    const shop = await openShop(page, () => ({ refusals: [{ path: '/v1/shop', status: 503 }] }));
    const answer = await page.goto(shop.url('/'));
    expect(answer?.status()).toBe(200);
    await expect(busyHeading(page)).toBeVisible();
    await expect(page.locator('.bare .logo')).toHaveCount(0);
    await expect(robots(page)).toHaveAttribute('content', 'noindex');
  });

  test('a signed-in shopper whose account is too busy to read waits, rather than signing in again', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({ shoppers: [rumana('en')] }));
    await signIn(page, shop);
    await shop.refuse([{ path: '/v1/shopper/me', status: 429, retryAfter: 20 }]);
    await page.goto(shop.url('/account'));
    await expect(busyHeading(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/account');
  });

  test('any other fault keeps the error page', async ({ page }) => {
    const shop = await openShop(page, () => ({ refusals: [{ path: PRODUCT, status: 500 }] }));
    const answer = await page.goto(shop.url('/p/cotton-panjabi'));
    expect(answer?.status()).toBe(500);
    await expect(busyHeading(page)).toHaveCount(0);
    await expect(page.getByText('The page tries again by itself', { exact: false })).toHaveCount(0);
  });
});

test.describe('a delivery charge the server is too busy to work out (p910-busy-delivery)', () => {
  test('says so in its place with Try again, which asks again; the rest of the page stays', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({
      refusals: [{ path: ESTIMATE, status: 429, retryAfter: 15 }],
    }));
    await seedArea(page, shop, THANA.mirpur);
    const refused = page.waitForResponse(isEstimate);
    await page.goto(shop.url('/p/cotton-panjabi'));
    const answer = await refused;
    // The storefront passes the server's refusal on as it came, never as its own 500.
    expect(answer.status()).toBe(429);
    expect(answer.headers()['retry-after']).toBe('15');
    await expect(deliveryLine(page)).toHaveText("Delivery: can't be shown right now · Try again");
    await expect(page.locator('.pricerow')).toBeVisible();
    await expect(busyHeading(page)).toHaveCount(0);

    await shop.refuse([]);
    const asked = page.waitForResponse(isEstimate);
    await deliveryLine(page).getByRole('button', { name: 'Try again' }).click();
    expect((await asked).status()).toBe(200);
    // The one product page (SB-31): once answered, the charge is the order summary's, and the busy line leaves.
    await expect(deliveryLine(page)).toHaveCount(0);
    await expect(page.locator('.sum .r', { hasText: 'Delivery · Dhaka city' })).toContainText(
      '৳70',
    );
  });

  test('says it in Bangla', async ({ page }) => {
    const shop = await openShop(
      page,
      () => ({ refusals: [{ path: ESTIMATE, status: 503 }] }),
      'bn',
    );
    await seedArea(page, shop, THANA.mirpur);
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.locator('.line', { hasText: /^ডেলিভারি চার্জ/ })).toHaveText(
      'ডেলিভারি চার্জ: এখন দেখা যাচ্ছে না · আবার চাপুন',
    );
  });

  test('a broken estimate stays a fault the storefront answers itself', async ({ page }) => {
    const shop = await openShop(page, () => ({ refusals: [{ path: ESTIMATE, status: 500 }] }));
    const failed = page.waitForResponse(isEstimate);
    await page.goto(shop.url('/p/cotton-panjabi'));
    expect((await failed).status()).toBe(500);
    await expect(page.getByText("can't be shown right now")).toHaveCount(0);
  });

  test("the edge's own 502, a server process that dropped the call, is a short wait, not a fault", async ({
    page,
  }) => {
    // Staging's live run (2026-11-19): a connection Caddy reused after the API had closed it came back 502, and the
    // delivery charge answered 500.
    const shop = await openShop(page, () => ({ refusals: [{ path: ESTIMATE, status: 502 }] }));
    await seedArea(page, shop, THANA.mirpur);
    const refused = page.waitForResponse(isEstimate);
    await page.goto(shop.url('/p/cotton-panjabi'));
    const answer = await refused;
    expect(answer.status()).toBe(503);
    expect(answer.headers()['retry-after']).toBe('5');
    await expect(deliveryLine(page)).toHaveText("Delivery: can't be shown right now · Try again");
  });
});

test.describe('an order the shop is too busy to take', () => {
  test("is busy with the server's wait, never a 500, when the shop itself is too busy to read", async ({
    page,
  }) => {
    // Staging's live run at the capacity model's peak (2026-11-19): the checkout answered 500 when the server was too
    // busy to name the shop. The order never reached the server, so the page can say busy and try again.
    const shop = await openShop(page, () => ({
      refusals: [{ path: '/v1/shop', status: 503, retryAfter: 7 }],
    }));
    await page.goto(shop.url('/'));
    await expect(busyHeading(page)).toBeVisible();
    const answer = await page.evaluate(async () => {
      const sent = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'busy-order-1' },
        body: JSON.stringify({ customerName: 'Rahima', items: [] }),
      });
      const body = (await sent.json()) as unknown;
      return { status: sent.status, wait: sent.headers.get('retry-after'), body };
    });
    expect(answer).toEqual({ status: 503, wait: '7', body: { code: 'busy' } });
  });
});
