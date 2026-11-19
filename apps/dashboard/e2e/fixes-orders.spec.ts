import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnCouriers } from './support/couriers';
import { dhaka, meghOrders, type OrderFixture } from './support/orders';

// The owner's fixing PR (2026-11-14; the prototype's "Fixes · orders & products", `fx-*`): a Processing tab; an order its
// verified advance payment confirmed, with no call; each item's SKU, quantity in its unit and price, its picture
// opening large; no Void on a payment the gateway or the listener verified; the courier's tracking code and link, each
// with Copy. The mocked day is Part 29's at Megh Fashion with these orders in it. Each test runs on a phone and a desktop.

/** A 1×1 PNG, for the items' pictures. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const MAHIN = '261031-0048';
const SHARMIN = '261031-0042';

/** Part 29's day, with an order its advance confirmed and one booked with Steadfast. */
function day(change: (orders: Record<'paid' | 'booked', OrderFixture>) => void = () => undefined) {
  const fixture = meghOrders();
  const base = fixture.orders[0];
  if (!base) throw new Error('no order to copy');
  const paid: OrderFixture = {
    ...structuredClone(base),
    id: 'o-48',
    number: MAHIN,
    status: 'confirmed',
    name: ['মাহিন রহমান', 'Mahin Rahman'],
    phone: '+8801819876543',
    createdAt: dhaka(11, 43),
    calls: [],
    items: [
      {
        name: ['ইরানি বোরকা', 'Irani burka'],
        variant: ['ডিজাইন 2 · M', 'Design 2 · M'],
        design: true,
        sku: 'IB-D2-M',
        quantity: 1,
        unitPrice: 2450,
        thumbnail: '/pic-burka-small.png',
        large: '/pic-burka-large.png',
      },
      {
        name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
        variant: ['L · কালো', 'L · Black'],
        sku: 'TS-L-BL',
        quantity: 2,
        unitPrice: 450,
        thumbnail: '/pic-shirt-small.png',
        large: '/pic-shirt-large.png',
      },
      {
        name: ['মিনিকেট চাল', 'Miniket rice'],
        variant: ['খোলা', 'Loose'],
        sku: 'RICE-MK',
        quantity: 1.5,
        unit: 'kg',
        unitPrice: 78,
      },
    ],
    deliveryCharge: 70,
    payments: [
      {
        method: 'bkash',
        amount: 500,
        sender: '01819876543',
        trxId: '9F2KQ7M1',
        at: dhaka(11, 44),
        level: 'listener',
      },
    ],
    confirmedByPayment: dhaka(11, 44),
  };
  const booked: OrderFixture = {
    ...structuredClone(base),
    id: 'o-42',
    number: SHARMIN,
    status: 'processing',
    name: ['শারমিন সুলতানা', 'Sharmin Sultana'],
    createdAt: dhaka(8, 50),
    calls: [{ outcome: 'confirmed', at: dhaka(8, 58) }],
    parcel: { courierKey: 'steadfast', cod: 3470, trackingCode: 'SF-2611-0842' },
    trackingLink: 'https://steadfast.com.bd/t/SF-2611-0842',
  };
  change({ paid, booked });
  fixture.orders.push(paid, booked);
  return fixture;
}

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  await page.route('**/pic-*.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );
  const log = await mockApi(page, {
    language: 'en',
    orders: day(),
    couriers: drawnCouriers(),
    ...state,
  });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const row = (page: Page, number: string) =>
  main(page).getByRole('link', { name: new RegExp(`^#${number}`) });
/** A card of the order page (the rounded white card), by its heading. */
const card = (page: Page, heading: string) =>
  main(page)
    .locator('div.rounded-card')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    .last();

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('the list has a Processing tab after Confirmed, counted, with the booked orders in it', async ({
  page,
}) => {
  const log = await open(page, '/orders');
  const tabs = main(page).getByRole('group').first();
  const names = await tabs.getByRole('button').allInnerTexts();
  const at = (word: string) => names.findIndex((name) => name.startsWith(word));
  expect(at('Processing')).toBe(at('Confirmed') + 1);
  expect(at('On hold')).toBe(at('Processing') + 1);
  await expect(tabs.getByRole('button', { name: /^Processing/ })).toContainText('1');

  await tabs.getByRole('button', { name: /^Processing/ }).click();
  await expect(page).toHaveURL(/tab=processing/);
  await expect(row(page, SHARMIN)).toBeVisible();
  await expect(row(page, SHARMIN)).toContainText('Processing');
  await expect(row(page, MAHIN)).toHaveCount(0);
  await expect
    .poll(() =>
      log.calls.some(
        (call) =>
          call.method === 'GET' &&
          call.path === '/orders' &&
          call.query.includes('status=processing'),
      ),
    )
    .toBe(true);
});

test('an order its verified advance payment confirmed is in Confirmed, tagged, and never in To confirm', async ({
  page,
}) => {
  await open(page, '/orders?tab=confirmed');
  await expect(row(page, MAHIN)).toBeVisible();
  await expect(row(page, MAHIN)).toContainText('Advance payment verified');
  await page.goto(`/${SLUG}/orders`);
  await expect(row(page, '261031-0047')).toBeVisible();
  await expect(row(page, MAHIN)).toHaveCount(0);
});

test('the order confirmed by its payment: no call needed, the timeline says why, what is paid and what is left', async ({
  page,
}) => {
  await open(page, '/orders/o-48');
  await expect(main(page).getByRole('heading', { name: `#${MAHIN}` })).toBeVisible();
  const calls = card(page, 'Calls');
  await expect(calls).toContainText(
    'No call needed: the advance payment is verified, so the order confirmed itself.',
  );
  await expect(calls).not.toContainText('No calls yet');
  // Its next step is to send it, never a call to confirm.
  await expect(main(page).getByRole('link', { name: /Call to confirm/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /Call to confirm/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Book courier' })).toBeVisible();

  const timeline = card(page, 'Timeline');
  await expect(timeline).toContainText('Confirmed');
  await expect(timeline).toContainText('Payment verified, so confirmed automatically');

  const pricing = card(page, 'Pricing');
  await expect(pricing).toContainText('Paid৳500');
  await expect(pricing).toContainText('Cash on delivery৳3,037');
  await expectAccessible(page);
});

test('a payment the listener verified says so and has Refund but no Void', async ({ page }) => {
  await open(page, '/orders/o-48');
  const payments = card(page, 'Payment');
  await expect(payments).toContainText('৳500 · TrxID 9F2KQ7M1');
  await expect(payments).toContainText('Verified automatically');
  await expect(payments).toContainText('The listener matched its SMS');
  await expect(payments).not.toContainText('Recorded by');
  await expect(payments.getByRole('button', { name: 'Refund' })).toBeVisible();
  await expect(payments.getByRole('button', { name: 'Void' })).toHaveCount(0);
  await expect(payments).toContainText(
    "A payment verified automatically can't be voided. If you give the money back, mark it Refund.",
  );
});

test('a gateway payment has no Void; a staff-verified one beside it keeps Void', async ({
  page,
}) => {
  await open(page, '/orders/o-48', {
    orders: day(({ paid }) => {
      paid.payments = [
        {
          method: 'bkash',
          amount: 200,
          sender: '01819876543',
          trxId: 'BGW4471K',
          at: dhaka(11, 43),
          level: 'gateway',
        },
        {
          method: 'nagad',
          amount: 300,
          sender: '01711234567',
          trxId: '7HQ2KD0P',
          at: dhaka(12, 5),
        },
      ];
    }),
  });
  const payments = card(page, 'Payment');
  await expect(payments).toContainText('Paid at bKash checkout');
  await expect(payments).toContainText('Recorded by Rumana');
  // One Void, the staff-verified payment's; both can be refunded.
  await expect(payments.getByRole('button', { name: 'Void' })).toHaveCount(1);
  await expect(payments.getByRole('button', { name: 'Refund' })).toHaveCount(2);
  await expect(payments.getByText('Verified automatically', { exact: true })).toHaveCount(1);
  await payments.getByRole('button', { name: 'Void' }).click();
  await expect(page.getByRole('dialog', { name: 'Void this payment?' })).toBeVisible();
});

test('each item names its design, SKU, quantity in its unit with the price of one, and each option by name', async ({
  page,
}) => {
  await open(page, '/orders/o-48');
  const items = card(page, 'Items');
  await expect(items).toContainText('Tap a picture to see it large');
  await expect(items).toContainText('SKU IB-D2-M');
  // The owner, 2026-11-19: chips, the design first, then each option as "Name: value".
  await expect(items).toContainText('Design 2');
  await expect(items).toContainText('Size: M');
  await expect(items).toContainText('1 pcs × ৳2,450');
  await expect(items).toContainText('SKU TS-L-BL');
  await expect(items).toContainText('2 pcs × ৳450');
  await expect(items).toContainText('Size: L');
  await expect(items).toContainText('Colour: Black');
  await expect(items).toContainText('৳900');
  // Sold by weight: a kilo and a half, at the price of a kilo.
  await expect(items).toContainText('SKU RICE-MK');
  await expect(items).toContainText('1.5 kg × ৳78');
  await expect(items).toContainText('৳117');
});

test('an item’s picture opens large, with the next and the previous across the order’s pictures', async ({
  page,
}) => {
  await open(page, '/orders/o-48');
  const items = card(page, 'Items');
  // Two items have a picture; the rice has none, so nothing to open.
  const pictures = items.getByRole('button', { name: 'Tap a picture to see it large' });
  await expect(pictures).toHaveCount(2);
  await pictures.first().click();
  const large = page.getByRole('dialog', { name: 'Irani burka' });
  await expect(large).toBeVisible();
  await expect(large.locator('img[src$="pic-burka-large.png"]')).toBeVisible();
  await expect(large).toContainText('1 of 2');
  await expect(large).toContainText('SKU IB-D2-M');
  await expect(large).toContainText('1 pcs × ৳2,450');
  await expect(large.getByRole('button', { name: 'Previous picture' })).toBeDisabled();

  await large.getByRole('button', { name: 'Next picture' }).click();
  const next = page.getByRole('dialog', { name: 'Cotton T-shirt' });
  await expect(next.locator('img[src$="pic-shirt-large.png"]')).toBeVisible();
  await expect(next).toContainText('2 of 2');
  await expect(next.getByRole('button', { name: 'Next picture' })).toBeDisabled();
  await next.getByRole('button', { name: 'Previous picture' }).click();
  await expect(page.getByRole('dialog', { name: 'Irani burka' })).toContainText('1 of 2');
});

test('a booked order shows its tracking code and link, each with Copy', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, '/orders/o-42');
  const courier = main(page)
    .locator('div')
    .filter({ hasText: 'Tracking code' })
    .filter({ hasText: 'Tracking link' })
    .last();
  await expect(courier).toContainText('SF-2611-0842');
  const link = courier.getByRole('link', { name: 'Track on Steadfast' });
  await expect(link).toHaveAttribute('href', 'https://steadfast.com.bd/t/SF-2611-0842');
  await expect(link).toHaveText(/steadfast\.com\.bd\/t\/SF-2611-0842/);
  await expect(link).toHaveAttribute('target', '_blank');

  const copies = courier.getByRole('button', { name: 'Copy' });
  await expect(copies).toHaveCount(2);
  await copies.first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SF-2611-0842');
  await copies.nth(1).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('https://steadfast.com.bd/t/SF-2611-0842');
  await expectAccessible(page);
});

test('in Bangla: the tab, the tag, the lines and the lock say what the sketch says', async ({
  page,
}) => {
  await open(page, '/orders?tab=confirmed', { language: 'bn' });
  await expect(main(page).getByRole('button', { name: /^প্রসেসিং/ })).toBeVisible();
  await expect(row(page, MAHIN)).toContainText('অ্যাডভান্স পেমেন্ট ভেরিফাইড');
  await page.goto(`/${SLUG}/orders/o-48`);
  await expect(main(page)).toContainText(
    'কল লাগবে না: অ্যাডভান্স পেমেন্ট ভেরিফাই হয়েছে, তাই অর্ডার নিজে থেকেই কনফার্ম হয়েছে।',
  );
  await expect(main(page)).toContainText('পেমেন্ট ভেরিফাইড, তাই নিজে থেকে কনফার্মড');
  await expect(main(page)).toContainText('নিজে থেকে ভেরিফাইড');
  await expect(main(page)).toContainText('লিসেনার SMS মিলিয়েছে');
  await expect(main(page)).toContainText('নিজে থেকে ভেরিফাই হওয়া পেমেন্ট ভয়েড করা যায় না।');
  await expect(main(page)).toContainText('2 পিস × ৳450');
  await expect(main(page)).toContainText('1.5 কেজি × ৳78');
  await expect(main(page)).toContainText('সাইজ: L');
  await expect(main(page)).toContainText('ছবিতে চাপ দিলে বড় হবে');
  await page.goto(`/${SLUG}/orders/o-42`);
  await expect(main(page)).toContainText('ট্র্যাকিং কোড');
  await expect(main(page)).toContainText('ট্র্যাকিং লিংক');
  // The courier card's two; the customer's tracking card has its own.
  await expect(
    main(page)
      .locator('div.rounded-card')
      .filter({ hasText: 'ট্র্যাকিং লিংক' })
      .last()
      .getByRole('button', { name: 'কপি' }),
  ).toHaveCount(2);
});
