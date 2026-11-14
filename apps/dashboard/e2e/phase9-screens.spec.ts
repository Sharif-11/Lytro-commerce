import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { invoiceOf, PAID_RENEWAL, PAID_TOP_UP, payment } from './support/payments';

// TENANT-DASHBOARD-DESIGN §7.45, Slice 9.9 (the prototype's Part 99): the banners for changes that can't be saved now
// (D9-14) and for Lytro's limited mode (DAT-38), the action bar's "Saving paused", a top-up's own invoice (D9-26) and
// invoices in the Mushak-6.3 form once Lytro is registered (D9-7). Each test runs on a phone and on a desktop.

const CANT_SAVE =
  "Because of a problem, changes won't be saved for a few minutes. You can still see everything; please try again shortly.";
const LIMITED_T = 'Exports, reports and reading orders from messages are paused for a while.';
const LIMITED_B = 'Orders and payments work as usual.';

/** The server's answer while changes can't be saved (9.2's SavingGuard), as the error filter writes it. */
const SAVING_PAUSED_ANSWER = {
  success: false,
  statusCode: 503,
  message: CANT_SAVE,
  errors: { code: 'service_unavailable', details: { savingPaused: true } },
};

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

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

test("says changes can't be saved while the server says so, and holds the action bar's Save", async ({
  page,
}) => {
  await open(page, '', { phase7: { savingPaused: true } });
  await expect(main(page).getByText(CANT_SAVE)).toBeVisible();
  await expectAccessible(page);

  await page.goto(`/${SLUG}/settings/shop`);
  await expect(main(page).getByText(CANT_SAVE)).toBeVisible();
  const paused = main(page).getByRole('button', { name: 'Saving paused' }).first();
  await expect(paused).toBeVisible();
  await expect(paused).toBeDisabled();
  await expect(main(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
});

test('a save refused for it shows the banner for its wait, then Save comes back', async ({
  page,
}) => {
  await page.clock.install();
  const log = await open(page, '/settings/shop');
  await expect(main(page).getByLabel('Shop name')).toHaveValue('Megh Fashion');
  await expect(main(page).getByText(CANT_SAVE)).toHaveCount(0);
  await page.route('**/api/v1/shop-settings', (route: Route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 503,
          headers: { 'retry-after': '30' },
          contentType: 'application/json',
          body: JSON.stringify(SAVING_PAUSED_ANSWER),
        })
      : route.fallback(),
  );

  await main(page).getByLabel('Shop name').fill('Megh Fashion House');
  await main(page).getByRole('button', { name: 'Save', exact: true }).first().click();
  // Said once, at the top: the form adds no fault of its own, and no error ID.
  await expect(main(page).getByText(CANT_SAVE)).toHaveCount(1);
  await expect(main(page).getByText('Error ID')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Saving paused' }).first()).toBeDisabled();
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);

  await page.clock.fastForward('00:31');
  await expect(main(page).getByText(CANT_SAVE)).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Save', exact: true }).first()).toBeEnabled();
});

test("any other 503 isn't the can't-save banner", async ({ page }) => {
  await open(page, '/settings/shop');
  await expect(main(page).getByLabel('Shop name')).toHaveValue('Megh Fashion');
  await page.route('**/api/v1/shop-settings', (route: Route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 503,
          headers: { 'retry-after': '300' },
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            statusCode: 503,
            message: 'Exports, reports and reading orders are paused for a while.',
            errors: { code: 'service_unavailable', details: {} },
          }),
        })
      : route.fallback(),
  );
  await main(page).getByLabel('Shop name').fill('Megh Fashion House');
  await main(page).getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(
    main(page).getByText('Exports, reports and reading orders are paused for a while.'),
  ).toBeVisible();
  await expect(main(page).getByText(CANT_SAVE)).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Save', exact: true }).first()).toBeEnabled();
});

test("shows Lytro's limited mode on every page while it's on", async ({ page }) => {
  await open(page, '', { phase7: { limitedMode: true } });
  await expect(main(page).getByText(LIMITED_T)).toBeVisible();
  await expect(main(page).getByText(LIMITED_B)).toBeVisible();
  await expectAccessible(page);
  await page.goto(`/${SLUG}/orders`);
  await expect(main(page).getByText(LIMITED_T)).toBeVisible();
});

test('says limited mode in Bangla', async ({ page }) => {
  await open(page, '', { language: 'bn', phase7: { limitedMode: true } });
  await expect(
    main(page).getByText('কিছুক্ষণ এক্সপোর্ট, রিপোর্ট আর মেসেজ থেকে অর্ডার পড়া বন্ধ থাকবে।'),
  ).toBeVisible();
  await expect(main(page).getByText('অর্ডার আর পেমেন্ট ঠিকমতো চলছে।')).toBeVisible();
});

test('shows nothing of either while neither holds', async ({ page }) => {
  await open(page, '');
  await expect(main(page).getByRole('heading').first()).toBeVisible();
  await expect(main(page).getByText(CANT_SAVE)).toHaveCount(0);
  await expect(main(page).getByText(LIMITED_T)).toHaveCount(0);
});

// --- Billing: a top-up's own invoice, and the Mushak-6.3 form (D9-7, D9-26).

const TOP_UP = payment({ ...PAID_TOP_UP, invoice: { id: 'inv-221', number: 221 } });

function topUpInvoice(vat: boolean): unknown {
  return {
    ...(invoiceOf('inv-221') as Record<string, unknown>),
    kind: 'top_up',
    planSnapshot: null,
    amount: '500.00',
    billingTermLabel: null,
    planName: null,
    planVersion: null,
    periodStart: null,
    periodEnd: null,
    paymentReference: '9F2KQ7',
    planPaymentId: TOP_UP.id,
    // 19 Oct 2026, 4:12 pm in Dhaka.
    issuedAt: '2026-10-19T10:12:00.000Z',
    ...(vat ? REGISTERED(65.22) : UNREGISTERED),
  };
}

const UNREGISTERED = {
  sellerName: null,
  sellerAddress: null,
  sellerBin: null,
  vatRate: null,
  vatAmount: null,
  shopAddress: null,
};

function REGISTERED(vatAmount: number): Record<string, string> {
  return {
    sellerName: 'Lytro',
    sellerAddress: 'House 12, Road 4, Nasirabad, Chattogram 4000',
    sellerBin: '004512367-0101',
    vatRate: '15.00',
    vatAmount: vatAmount.toFixed(2),
    shopAddress: 'Shop 12, Rapa Plaza, Dhanmondi, Dhaka',
  };
}

test("a top-up shows its own invoice, kind Top-up, as it is before Lytro's registration", async ({
  page,
}) => {
  await open(page, `/billing/${TOP_UP.id}`, {
    money: { payments: [TOP_UP], invoices: { 'inv-221': topUpInvoice(false) } },
  });
  await expect(main(page).getByRole('heading', { name: 'INV-000221' })).toBeVisible();
  await expect(main(page).getByText('Top-up', { exact: true })).toBeVisible();
  await expect(main(page).getByText('Added to the balance', { exact: true })).toBeVisible();
  await expect(main(page).getByText('19 Oct 2026', { exact: true })).toBeVisible();
  await expect(main(page).getByText('Tax invoice (Mushak-6.3)')).toHaveCount(0);
  await expect(main(page).getByText(/VAT included/)).toHaveCount(0);
  await expectAccessible(page);
});

test('once registered, a top-up and a plan invoice take the Mushak-6.3 form', async ({ page }) => {
  await open(page, `/billing/${TOP_UP.id}`, {
    money: {
      payments: [TOP_UP, PAID_RENEWAL],
      invoices: {
        'inv-221': topUpInvoice(true),
        'inv-214': { ...(invoiceOf('inv-214') as Record<string, unknown>), ...REGISTERED(58.57) },
      },
    },
  });
  await expect(main(page).getByText('Tax invoice (Mushak-6.3)')).toBeVisible();
  await expect(main(page).getByText('19 Oct 2026, 4:12 pm')).toBeVisible();
  await expect(main(page).getByText('VAT included (15%)')).toBeVisible();
  await expect(main(page).getByText('৳65.22')).toBeVisible();
  await expect(main(page).getByText('Shop 12, Rapa Plaza, Dhanmondi, Dhaka')).toBeVisible();
  await expect(main(page).getByText('House 12, Road 4, Nasirabad, Chattogram 4000')).toBeVisible();
  await expect(main(page).getByText('004512367-0101')).toBeVisible();
  await expectAccessible(page);

  await page.goto(`/${SLUG}/billing/${PAID_RENEWAL.id}`);
  await expect(main(page).getByRole('heading', { name: 'INV-000214' })).toBeVisible();
  await expect(main(page).getByText('Tax invoice (Mushak-6.3)')).toBeVisible();
  await expect(main(page).getByText('৳58.57')).toBeVisible();
  // The buyer and the seller take the place of "Billed to".
  await expect(main(page).getByText('Buyer', { exact: true })).toBeVisible();
  await expect(main(page).getByText('Seller', { exact: true })).toBeVisible();
});

test('a plan paid from the balance shows no VAT, and once registered says why', async ({
  page,
}) => {
  const fromBalance = payment({
    ...PAID_RENEWAL,
    id: 'pay_2bal10',
    method: 'balance',
    transactionId: null,
    senderNumber: null,
    invoice: { id: 'inv-215', number: 215 },
  });
  const balanceInvoice = {
    ...(invoiceOf('inv-215') as Record<string, unknown>),
    paymentMethod: 'balance',
    paymentReference: null,
    planPaymentId: fromBalance.id,
    issuedAt: '2026-10-20T03:00:00.000Z',
    ...UNREGISTERED,
  };
  await open(page, `/billing/${fromBalance.id}`, {
    money: { payments: [fromBalance], invoices: { 'inv-215': balanceInvoice } },
  });
  await expect(main(page).getByRole('heading', { name: 'INV-000215' })).toBeVisible();
  await expect(main(page).getByText(/VAT/)).toHaveCount(0);

  // A tax invoice issued before it (the top-up that filled the balance) shows Lytro was registered then.
  await page.route('**/api/v1/billing/invoices', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [topUpInvoice(true), balanceInvoice] }),
    }),
  );
  await page.reload();
  await expect(main(page).getByRole('heading', { name: 'INV-000215' })).toBeVisible();
  await expect(
    main(page).getByText(
      'Paid from the balance, so this invoice shows no VAT: the top-up that put the money in the balance showed it on its own invoice.',
    ),
  ).toBeVisible();
  await expect(main(page).getByText('Tax invoice (Mushak-6.3)')).toHaveCount(0);
});
