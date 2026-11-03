import { expect, test } from '@playwright/test';
import { trackedOrder } from './support/fixtures';
import { alertOn, openShop } from './support/shop';

// ORD-17, SFT-08 (Slice 4.8e, the prototype's `tracking`): an order at a stable address for its tracking ID.

test('asks for an ID, and finds an order however it is typed', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
  }));
  await page.goto(shop.url('/track'));
  await expect(page.getByText('Enter the tracking ID you got when you ordered.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tracking ID' }).fill(' k7f2m9qx ');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.waitForURL('**/track/K7F2M9QX');
  await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
});

test('just placed: waiting for the shop to call', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'placed') },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  const steps = page.locator('.tl .s');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toHaveClass(/now/);
  await expect(steps.nth(0)).toContainText('Waiting for the shop to call');
  await expect(steps.nth(1)).toHaveClass(/todo/);
  await expect(page.locator('.sechead .st')).toHaveText('Placed');
  await expect(page.locator('.line', { hasText: 'Courier' })).toHaveCount(0);
});

test('shipped: each step its time on Dhaka’s clock, and the courier line', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'shipped') },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  const steps = page.locator('.tl .s');
  await expect(steps.nth(0)).toContainText('31 Oct, 11:42');
  await expect(steps.nth(1)).toContainText('31 Oct, 12:10');
  await expect(steps.nth(2)).toContainText('31 Oct, 18:12');
  await expect(steps.nth(3)).toHaveClass(/todo/);
  await expect(page.locator('.sechead .st')).toHaveText('Shipped');
  await expect(page.locator('.line', { hasText: 'Courier' })).toContainText(
    'Courier: Steadfast · SF-2610-4471',
  );
  await expect(page.getByRole('link', { name: "Courier's page" })).toHaveAttribute(
    'href',
    'https://steadfast.example/track/SF-2610-4471',
  );
});

test('a courier with no code or link leaves no empty half', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: {
      K7F2M9QX: {
        ...trackedOrder(language, 'shipped'),
        courier: { name: 'Pathao', trackingCode: null, trackingLink: null },
      },
    },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  await expect(page.locator('.line', { hasText: 'Courier' })).toHaveText('Courier: Pathao');
});

test('names its items as ordered: options, a combo’s parts, add-ons, answers, the tax', async ({
  page,
}) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  const lines = page.locator('.side .cl');
  await expect(lines.nth(0)).toContainText('M · White × 1');
  await expect(lines.nth(0)).toContainText('+ Gift wrap ৳50');
  await expect(lines.nth(0)).toContainText('Name to embroider: Rafi');
  await expect(lines.nth(1)).toContainText('Chosen: Panjabi L, Check lungi');
  await expect(page.locator('.sum .r.total .price')).toHaveText('৳2,870');
  await expect(page.locator('.sum').getByText('Includes VAT 5%')).toBeVisible();
  // Never the customer's address or phone: the read holds neither.
  await expect(page.locator('.side')).not.toContainText('01711');
});

test('an add-on reads its own price, however many were ordered and however dear', async ({
  page,
}) => {
  const shop = await openShop(page, (language) => {
    const order = trackedOrder(language, 'confirmed');
    const [first, ...rest] = order.items;
    if (!first) throw new Error('the order has items');
    return {
      tracked: {
        K7F2M9QX: {
          ...order,
          items: [
            {
              ...first,
              quantity: '2.000',
              modifiers: [
                { groupName: 'Stitching', optionName: 'Hand stitching', priceChange: '1200.00' },
              ],
            },
            ...rest,
          ],
        },
      },
    };
  });
  await page.goto(shop.url('/track/K7F2M9QX'));
  await expect(page.locator('.side .cl').first()).toContainText('+ Hand stitching ৳1,200');
});

test('delivered, returned and cancelled each read as drawn', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: {
      DDDDDDDD: trackedOrder(language, 'delivered'),
      RRRRRRRR: trackedOrder(language, 'returned'),
      CCCCCCCC: trackedOrder(language, 'cancelled'),
    },
  }));
  await page.goto(shop.url('/track/DDDDDDDD'));
  await expect(page.locator('.sechead .st')).toHaveText('Delivered');
  await expect(page.locator('.tl .s.todo')).toHaveCount(0);

  await page.goto(shop.url('/track/RRRRRRRR'));
  await expect(page.locator('.sechead .st')).toHaveText('Returned');

  await page.goto(shop.url('/track/CCCCCCCC'));
  await expect(page.locator('.sechead .st')).toHaveText('Cancelled');
  await expect(
    page.getByText('The shop cancelled this order. Call the shop to ask why.'),
  ).toBeVisible();
  await expect(page.locator('.tl .s')).toHaveCount(2);
  await expect(page.locator('.line', { hasText: 'Courier' })).toHaveCount(0);
});

test('an ID that finds nothing says so, the search still there', async ({ page }) => {
  const shop = await openShop(page);
  await page.goto(shop.url('/track/NOSUCHID'));
  await expect(alertOn(page)).toHaveText('No order has that ID. Check it and try again.');
  await expect(page.getByRole('textbox', { name: 'Tracking ID' })).toHaveValue('NOSUCHID');
});

test('works with the storefront off, in the landing page’s frame (LND-02, LND-11)', async ({
  page,
}) => {
  const shop = await openShop(page, (language) => ({
    storefrontEnabled: false,
    tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
  }));
  const answer = await page.goto(shop.url('/track/K7F2M9QX'));
  expect(answer?.status()).toBe(200);
  await expect(page.locator('.hdr.minimal')).toBeVisible();
  await expect(page.locator('.hdr nav')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
});

test('in the storefront, its frame leads home', async ({ page }) => {
  const shop = await openShop(page);
  await page.goto(shop.url('/track'));
  await expect(page.locator('.hdr .back')).toHaveAttribute('href', '/');
});
