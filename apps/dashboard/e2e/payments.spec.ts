import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { automatedMethods } from './support/payment-methods';
import {
  drawnShopPayments,
  OLD_PHONE,
  RUMANA,
  SHOP_PHONE,
  type ShopPaymentsFixture,
} from './support/shop-payments';

// TENANT-DASHBOARD-DESIGN §7.36, Slice 5.8's part 3 (the prototype's Part 35): Money's Payments. What waits to be verified, the
// phone's receipts, and every payment. Each test runs on a phone and on a desktop.

const PAGE = '/payments';

async function open(
  page: Page,
  fixture: ShopPaymentsFixture = drawnShopPayments(),
  state: ShopState = {},
  query = '',
): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', shopPayments: fixture, ...state });
  await page.goto(`/${SLUG}${PAGE}${query}`);
  await expect(page.getByRole('main').getByRole('button', { name: /^To verify/ })).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog');
const tab = (page: Page, name: string | RegExp) => main(page).getByRole('button', { name });
/** A waiting payment's block, by its TrxID. */
const waitingRow = (page: Page, trx: string) =>
  main(page).locator('div.flex.flex-col.gap-2\\.5', { hasText: `TrxID ${trx}` });

function sent(log: ApiLog, method: string, path: string): unknown[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body);
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

test('Money opens on Payments, first among its sections', async ({ page }) => {
  await mockApi(page, { language: 'en', shopPayments: drawnShopPayments() });
  await page.goto(`/${SLUG}`);
  await page.getByRole('link', { name: 'Money', exact: true }).first().click();
  await expect(page).toHaveURL(`/${SLUG}/payments`);
  await expect(tab(page, /^To verify/)).toBeVisible();
});

test('what waits: each payment says why, with the decisions under it', async ({ page }) => {
  await open(page);
  await expect(tab(page, /^To verify/)).toContainText('4');
  await expect(waitingRow(page, '8HC3P2M1')).toContainText('৳500');
  await expect(waitingRow(page, '8HC3P2M1')).toContainText('01712 000 111');
  await expect(waitingRow(page, '8HC3P2M1')).toContainText(
    'Amount mismatch: ৳500 was asked, the SMS says ৳450',
  );
  await expect(waitingRow(page, '5TK9WQ2B')).toContainText(
    'Sender mismatch: the shopper typed 01819 000 222, the SMS came from 01555 123 456',
  );
  // A wallet a phone can read, with a phone paired, and nothing has come.
  await expect(waitingRow(page, '2LM7VN6C')).toContainText('No SMS has come for this TrxID yet.');
  // Phones read bKash only so far (LSN-06), so Nagad's silence says nothing.
  await expect(waitingRow(page, 'N7Q2ZX41')).not.toContainText('No SMS');
  await expect(
    waitingRow(page, '8HC3P2M1').getByRole('link', { name: '#261105-0040' }),
  ).toHaveAttribute('href', `/${SLUG}/orders/order-s-amount`);
  await expect(main(page).getByRole('button', { name: 'Approve' })).toHaveCount(4);
  await expect(main(page).getByRole('button', { name: 'Reject', exact: true })).toHaveCount(4);
  // PAY-18 is withdrawn: no proof to look at.
  await expect(main(page).getByText('Proof')).toHaveCount(0);
  await expectAccessible(page);
});

test('every reason a receipt asks staff has its own words', async ({ page }) => {
  const fixture = drawnShopPayments();
  const base = fixture.payments[0];
  if (!base) throw new Error('no payment');
  const receipt = { amount: '500.00', senderNumber: null, receivedAt: base.at };
  fixture.payments = (
    [
      ['wallet', 'The SMS came from a different wallet than the shopper chose.'],
      ['old_receipt', "This SMS is older than the payment, so it wasn't matched by itself."],
      ['low_balance', "Your balance was short, so this wasn't verified by itself."],
      ['order_closed', 'The order was no longer open when the SMS came.'],
      ['transaction_id_used', 'This TrxID was already used on another payment.'],
      ['by_hand', 'You check this wallet by hand. The SMS says ৳500 arrived.'],
    ] as const
  ).map(([reason], at) => ({
    ...base,
    id: `s-${reason}`,
    transactionId: `TRX${String(at)}`,
    reviewReason: reason,
    receipt,
  }));
  await open(page, fixture);
  for (const [at, words] of [
    'The SMS came from a different wallet than the shopper chose.',
    "This SMS is older than the payment, so it wasn't matched by itself.",
    "Your balance was short, so this wasn't verified by itself.",
    'The order was no longer open when the SMS came.',
    'This TrxID was already used on another payment.',
    'You check this wallet by hand. The SMS says ৳500 arrived.',
  ].entries()) {
    await expect(waitingRow(page, `TRX${String(at)}`)).toContainText(words);
  }
});

test('Approve never acts at once: the amount starts as what the SMS says', async ({ page }) => {
  const log = await open(page);
  await waitingRow(page, '8HC3P2M1').getByRole('button', { name: 'Approve' }).click();
  expect(sent(log, 'POST', '/payments/s-amount/verify')).toEqual([]);
  const approving = sheet(page);
  await expect(approving.getByRole('heading', { name: 'Approve this payment' })).toBeVisible();
  await expect(approving.getByLabel('How much arrived')).toHaveValue('450');
  await expect(approving).toContainText('The SMS says ৳450; ৳500 was asked.');
  await expect(approving).toContainText('The other ৳50 stays due on the order.');
  await expectAccessible(page);
  await approving.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved. ৳450 added to order #261105-0040.')).toBeVisible();
  expect(sent(log, 'POST', '/payments/s-amount/verify')).toEqual([{ amount: '450' }]);
  // The list is read again: it's gone from what waits, and the count falls.
  await expect(waitingRow(page, '8HC3P2M1')).toHaveCount(0);
  await expect(tab(page, /^To verify/)).toContainText('3');
});

test('Approve with no SMS starts at what was asked, and staff can change it', async ({ page }) => {
  const log = await open(page);
  await waitingRow(page, '2LM7VN6C').getByRole('button', { name: 'Approve' }).click();
  const approving = sheet(page);
  await expect(approving.getByLabel('How much arrived')).toHaveValue('800');
  await expect(approving).toContainText('৳800 was asked. Enter what really arrived.');
  await expect(approving).not.toContainText('stays due');
  await approving.getByLabel('How much arrived').fill('');
  await expect(approving.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await approving.getByLabel('How much arrived').fill('750');
  await expect(approving).toContainText('The other ৳50 stays due on the order.');
  await approving.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved. ৳750 added to order #261105-0037.')).toBeVisible();
  expect(sent(log, 'POST', '/payments/s-plain/verify')).toEqual([{ amount: '750' }]);
});

test('more than the order has due is refused beside the amount', async ({ page }) => {
  const log = await open(page);
  await waitingRow(page, '2LM7VN6C').getByRole('button', { name: 'Approve' }).click();
  const approving = sheet(page);
  await approving.getByLabel('How much arrived').fill('5000');
  await approving.getByRole('button', { name: 'Approve' }).click();
  await expect(approving).toContainText("It can't be more than the order has due.");
  await expect(approving.getByRole('heading', { name: 'Approve this payment' })).toBeVisible();
  expect(sent(log, 'POST', '/payments/s-plain/verify')).toHaveLength(1);
  // Changing the figure clears the refusal.
  await approving.getByLabel('How much arrived').fill('800');
  await expect(approving).not.toContainText("It can't be more");
});

test('a phone that verified it first is said plainly, and the list is read again', async ({
  page,
}) => {
  const fixture = drawnShopPayments();
  const log = await open(page, fixture);
  await page.route('**/api/v1/payments/s-plain/verify', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        statusCode: 409,
        message: 'This payment is no longer waiting.',
        errors: { code: 'conflict', details: {} },
      }),
    }),
  );
  await waitingRow(page, '2LM7VN6C').getByRole('button', { name: 'Approve' }).click();
  const before = log.calls.filter((call) => call.path === '/payments').length;
  await sheet(page).getByRole('button', { name: 'Approve' }).click();
  await expect(sheet(page)).toContainText('This payment is no longer waiting.');
  await expect
    .poll(() => log.calls.filter((call) => call.path === '/payments').length)
    .toBeGreaterThan(before);
});

test("Reject: a checkout's order is cancelled, and says so", async ({ page }) => {
  const log = await open(page);
  await waitingRow(page, '8HC3P2M1').getByRole('button', { name: 'Reject', exact: true }).click();
  const rejecting = sheet(page);
  await expect(rejecting.getByRole('heading', { name: 'Reject this payment?' })).toBeVisible();
  await expect(rejecting).toContainText(
    'Order #261105-0040 will be cancelled and its stock released. The shopper sees this reason.',
  );
  await expect(
    rejecting.getByRole('radio', { name: 'No money arrived with this TrxID' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expectAccessible(page);
  await rejecting.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected.', { exact: true })).toBeVisible();
  expect(sent(log, 'POST', '/payments/s-amount/reject')).toEqual([{ reason: 'no_payment_found' }]);
  await expect(waitingRow(page, '8HC3P2M1')).toHaveCount(0);
});

test("Reject: a payment link's order stays as it is", async ({ page }) => {
  const log = await open(page);
  await waitingRow(page, '5TK9WQ2B').getByRole('button', { name: 'Reject' }).click();
  const rejecting = sheet(page);
  await expect(rejecting).toContainText('The order stays as it is. The shopper sees this reason.');
  await expect(rejecting).not.toContainText('will be cancelled');
  await rejecting.getByRole('radio', { name: 'This TrxID was already used' }).click();
  await rejecting.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected.', { exact: true })).toBeVisible();
  expect(sent(log, 'POST', '/payments/s-sender/reject')).toEqual([
    { reason: 'transaction_id_used' },
  ]);
});

test('Reject: something else needs a note, which the shopper reads', async ({ page }) => {
  const log = await open(page);
  await waitingRow(page, '8HC3P2M1').getByRole('button', { name: 'Reject', exact: true }).click();
  const rejecting = sheet(page);
  await rejecting.getByRole('radio', { name: 'Something else' }).click();
  await expect(rejecting.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await expect(rejecting).toContainText('Write the reason. The shopper sees it.');
  await rejecting.getByLabel('Note').fill('   ');
  await expect(rejecting.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await rejecting.getByLabel('Note').fill('Wrong shop');
  await rejecting.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected.', { exact: true })).toBeVisible();
  expect(sent(log, 'POST', '/payments/s-amount/reject')).toEqual([
    { reason: 'other', note: 'Wrong shop' },
  ]);
});

test('whoever may only read sees no decisions and no receipts', async ({ page }) => {
  const log = await open(page, drawnShopPayments(), {
    isOwner: false,
    permissions: ['payments:read'],
  });
  await expect(waitingRow(page, '8HC3P2M1')).toContainText('Amount mismatch');
  await expect(main(page).getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  await expect(tab(page, 'Phone receipts')).toHaveCount(0);
  // It may not read the phones, so it isn't told about them and doesn't ask.
  await expect(main(page).getByText('Listener phone seen')).toHaveCount(0);
  expect(log.calls.some((call) => call.path === '/listener/devices')).toBe(false);
  expect(log.calls.some((call) => call.path === '/payment-methods')).toBe(false);
  // Nor can the address open them.
  await page.goto(`/${SLUG}${PAGE}?tab=receipts`);
  await expect(tab(page, /^To verify/)).toHaveAttribute('aria-pressed', 'true');
  expect(log.calls.some((call) => call.path === '/listener/receipts')).toBe(false);
});

test('the phones: working, gone quiet or none, in one line', async ({ page }) => {
  const fixture = drawnShopPayments();
  await open(page, fixture);
  await expect(main(page)).toContainText('Listener phone seen 4 min ago');

  fixture.phones = [SHOP_PHONE, OLD_PHONE];
  await page.reload();
  await expect(main(page)).toContainText(
    "The listener phone hasn't been seen for 2 hours. Until it's back, payments need checking by hand.",
  );
  await expect(main(page).getByRole('link', { name: 'See phones' })).toHaveAttribute(
    'href',
    `/${SLUG}/settings/listener`,
  );

  fixture.phones = [OLD_PHONE];
  await page.reload();
  await expect(main(page)).toContainText(
    'No listener phone is paired, so each payment needs checking by hand.',
  );
  await expect(main(page).getByRole('link', { name: 'Pair a phone' })).toHaveAttribute(
    'href',
    `/${SLUG}/settings/listener`,
  );
  // With no phone, no SMS was ever going to come.
  await expect(waitingRow(page, '2LM7VN6C')).not.toContainText('No SMS');
  await expectAccessible(page);
});

test("the phones' line stays away from a shop whose wallets don't listen", async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.phones = [];
  const log = await open(page, fixture, { paymentMethods: automatedMethods('en') });
  await expect.poll(() => log.calls.some((call) => call.path === '/payment-methods')).toBe(true);
  await expect(main(page).getByText('No listener phone is paired')).toHaveCount(0);
});

test('phone receipts: what really arrived, money with no order included', async ({ page }) => {
  const log = await open(page);
  await tab(page, 'Phone receipts').click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}${PAGE}\\?tab=receipts`));
  await expect(main(page)).toContainText('The payment SMS your phone has read');
  await expect(main(page).getByRole('button', { name: /৳450/ })).toContainText('Needs review');
  await expect(main(page).getByRole('button', { name: /৳1,500/ })).toContainText('No order');
  await expect(main(page).getByRole('button', { name: /৳500/ })).toContainText('Matched');
  // The file holds payments, not receipts, and the filter's choices are about payments too.
  await expect(main(page).getByRole('button', { name: 'CSV' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Filter' })).toHaveCount(0);
  await expectAccessible(page);

  await main(page).getByRole('button', { name: /৳450/ }).click();
  await expect(sheet(page)).toContainText('You have received Tk 450.00 from 01712000111.');
  await expect(sheet(page)).toContainText("Rumana's phone");
  await expect(sheet(page)).toContainText('The SMS text is removed after 90 days.');
  await sheet(page).getByRole('button', { name: /close/i }).click();

  await main(page)
    .getByRole('button', { name: /৳1,500/ })
    .click();
  await expect(sheet(page)).toContainText(
    'No order has this TrxID. If the shopper gives it on the payment page, it matches by itself.',
  );
  await sheet(page).getByRole('button', { name: /close/i }).click();

  await main(page).getByPlaceholder('TrxID, number or amount').fill('4xw');
  await expect
    .poll(() =>
      log.calls.some((call) => call.path === '/listener/receipts' && call.query.includes('q=4xw')),
    )
    .toBe(true);
  await expect(main(page).getByRole('button', { name: /৳450/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /৳1,500/ })).toBeVisible();
});

test('phone receipts with no phone paired offers to pair one', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.phones = [];
  fixture.receipts = [];
  await open(page, fixture, {}, '?tab=receipts');
  await expect(main(page)).toContainText('Receipts show here once a phone is paired.');
  // Beside the same link in the line about phones.
  const links = main(page).getByRole('link', { name: 'Pair a phone' });
  await expect(links).toHaveCount(2);
  await expect(links.last()).toHaveAttribute('href', `/${SLUG}/settings/listener`);
});

test('All: how many, by day, and each one opens', async ({ page }) => {
  await open(page);
  await tab(page, 'All').click();
  // A count alone: a sum across every status would add rejected and voided money to what came in.
  await expect(main(page)).toContainText('10 payments');
  await expect(main(page)).not.toContainText('in all');
  await expect(main(page)).toContainText('Today');
  await expect(main(page)).toContainText('Yesterday');
  await expect(main(page).getByRole('button', { name: /TEST0042/ })).toContainText('Test');
  await expect(main(page).getByRole('button', { name: /6HN2CC80/ })).toContainText('Rejected');
  await expect(main(page).getByRole('button', { name: /R5Y8BB13/ })).toContainText('Refunded');
  await expect(main(page).getByRole('button', { name: /REF-77120/ })).toContainText('Voided');
  await expectAccessible(page);

  await main(page)
    .getByRole('button', { name: /9F2KQ7M1/ })
    .click();
  const detail = sheet(page);
  await expect(detail).toContainText('How it was verified');
  await expect(detail).toContainText('Listener phone');
  await expect(detail).toContainText('Lytro, by itself');
  await expect(detail).toContainText('Checkout');
  await expect(detail.getByRole('link', { name: 'Open the order' })).toHaveAttribute(
    'href',
    `/${SLUG}/orders/order-39`,
  );
  await detail.getByRole('button', { name: /close/i }).click();

  await main(page)
    .getByRole('button', { name: /3M8KLP21/ })
    .click();
  await expect(sheet(page)).toContainText('By hand');
  await expect(sheet(page)).toContainText('Rumana');
  await sheet(page).getByRole('button', { name: /close/i }).click();

  await main(page)
    .getByRole('button', { name: /6HN2CC80/ })
    .click();
  await expect(sheet(page)).toContainText('Why it was rejected');
  await expect(sheet(page)).toContainText('No money arrived with this TrxID');
  await expect(sheet(page)).toContainText('Payment link');
  await sheet(page).getByRole('button', { name: /close/i }).click();

  await main(page)
    .getByRole('button', { name: /TEST0042/ })
    .click();
  await expect(sheet(page)).toContainText('A test payment, left out of the totals.');
  await expect(sheet(page)).toContainText('Automated checkout');
});

for (const [name, word, query] of [
  ['Verified', 'TrxID 9F2KQ7M1', 'status=verified'],
  ['Rejected', 'TrxID 6HN2CC80', 'status=rejected'],
  ['Refunded', 'TrxID R5Y8BB13', 'status=refunded'],
  ['Voided', 'TrxID REF-77120', 'status=voided'],
] as const) {
  test(`${name}: its own list, from the server`, async ({ page }) => {
    const log = await open(page);
    await tab(page, name).click();
    await expect(main(page).getByRole('button', { name: new RegExp(word) })).toBeVisible();
    await expect(main(page)).toContainText(' in all');
    expect(log.calls.some((call) => call.path === PAGE && call.query.includes(query))).toBe(true);
  });
}

test("a status's tab totals its money, test payments left out", async ({ page }) => {
  await open(page);
  await tab(page, 'Verified').click();
  // ৳500 by the listener and ৳990 by hand; the ৳200 test payment is listed and not counted in the money.
  await expect(main(page)).toContainText('3 payments · ৳1,490 in all');
  await expect(main(page).getByRole('button', { name: /TEST0042/ })).toContainText('Test');
});

test('a tab with nothing in it says so', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.payments = fixture.payments.filter((row) => row.status !== 'rejected');
  await open(page, fixture);
  await tab(page, 'Rejected').click();
  await expect(main(page)).toContainText('No payments here.');
  await expect(main(page)).not.toContainText('in all');
});

test('nothing waiting says so', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.payments = fixture.payments.filter((row) => row.status !== 'to_verify');
  await open(page, fixture);
  await expect(main(page)).toContainText('Nothing to verify right now.');
  // No count on a tab with nothing in it.
  await expect(tab(page, /^To verify/)).toHaveText('To verify');
});

test('the filter asks the server, and Back from an order keeps the list', async ({ page }) => {
  const log = await open(page);
  await tab(page, 'All').click();
  await main(page).getByRole('button', { name: 'Filter' }).click();
  const filter = sheet(page);
  await filter.getByRole('button', { name: 'Nagad' }).click();
  await filter.getByLabel('From').fill('2026-11-01');
  await filter.getByLabel('To').fill('2026-11-05');
  await filter.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(/tab=all/);
  await expect(page).toHaveURL(/method=nagad/);
  await expect
    .poll(() =>
      log.calls.some(
        (call) =>
          call.path === PAGE &&
          call.query.includes('method=nagad') &&
          call.query.includes('dateFrom=2026-11-01') &&
          call.query.includes('dateTo=2026-11-05'),
      ),
    )
    .toBe(true);
  await expect(main(page).getByRole('button', { name: /3M8KLP21/ })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /9F2KQ7M1/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Filter' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Clear takes every filter off, and the tab stays.
  await main(page).getByRole('button', { name: 'Filter' }).click();
  await sheet(page).getByRole('button', { name: 'Clear' }).click();
  await expect(page).not.toHaveURL(/method=/);
  await expect(page).toHaveURL(/tab=all/);
  await expect(main(page).getByRole('button', { name: /9F2KQ7M1/ })).toBeVisible();
});

test('search reads the server as staff type, and stays in the address', async ({ page }) => {
  const log = await open(page);
  await main(page).getByPlaceholder('TrxID, number or order').fill('2lm');
  await expect(page).toHaveURL(/q=2lm/);
  await expect
    .poll(() => log.calls.some((call) => call.path === PAGE && call.query.includes('q=2lm')))
    .toBe(true);
  await expect(waitingRow(page, '2LM7VN6C')).toBeVisible();
  await expect(waitingRow(page, '8HC3P2M1')).toHaveCount(0);
  await page.reload();
  await expect(main(page).getByPlaceholder('TrxID, number or order')).toHaveValue('2lm');
  await expect(waitingRow(page, '8HC3P2M1')).toHaveCount(0);
});

test('CSV names this shop and carries the tab and filters', async ({ page }) => {
  await open(page, drawnShopPayments(), {}, '?tab=verified&method=bkash');
  const asked = page.waitForRequest((request) => request.url().includes('/payments/export'));
  const saved = page.waitForEvent('download');
  await main(page).getByRole('button', { name: 'CSV' }).click();
  const request = await asked;
  // A plain link can't send this, and the server would answer for another of the owner's shops.
  expect(request.headers()['x-lytro-shop']).toBe(SLUG);
  expect(request.url()).toContain('status=verified');
  expect(request.url()).toContain('method=bkash');
  expect((await saved).suggestedFilename()).toBe('payments.csv');
});

test('a CSV the server refuses says so', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/payments/export**', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        statusCode: 403,
        message: 'You may not export these.',
        errors: { code: 'forbidden', details: {} },
      }),
    }),
  );
  await main(page).getByRole('button', { name: 'CSV' }).click();
  await expect(main(page)).toContainText('You may not export these.');
});

test('more than a page shows more when asked', async ({ page }) => {
  const fixture = drawnShopPayments();
  const base = fixture.payments[0];
  if (!base) throw new Error('no payment');
  fixture.payments = Array.from({ length: 30 }, (_, at) => ({
    ...base,
    id: `s-${String(at)}`,
    transactionId: `MANY${String(at).padStart(4, '0')}`,
  }));
  await open(page, fixture);
  await expect(main(page).getByRole('button', { name: 'Approve' })).toHaveCount(25);
  await main(page).getByRole('button', { name: 'Show more' }).click();
  await expect(main(page).getByRole('button', { name: 'Approve' })).toHaveCount(30);
  await expect(main(page).getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('a new shop is told to add a wallet first', async ({ page }) => {
  const fixture = drawnShopPayments();
  fixture.payments = [];
  fixture.phones = [];
  await mockApi(page, { language: 'en', shopPayments: fixture, walletOff: true });
  await page.goto(`/${SLUG}${PAGE}`);
  await expect(main(page)).toContainText('Payments will appear here. Add a wallet number first.');
  await expect(main(page).getByRole('link', { name: 'Add account' })).toHaveAttribute(
    'href',
    `/${SLUG}/settings/payment-methods`,
  );
  await expect(tab(page, /^To verify/)).toHaveCount(0);
});

test('a shop with its wallets off keeps the payments it has', async ({ page }) => {
  await mockApi(page, { language: 'en', shopPayments: drawnShopPayments(), walletOff: true });
  await page.goto(`/${SLUG}${PAGE}`);
  await expect(tab(page, /^To verify/)).toBeVisible();
  await expect(main(page)).not.toContainText('Add a wallet number first');
});

test('reads in Bangla, with no key showing', async ({ page }) => {
  await mockApi(page, { language: 'bn', shopPayments: drawnShopPayments() });
  await page.goto(`/${SLUG}${PAGE}`);
  await expect(main(page).getByRole('button', { name: /^ভেরিফাই বাকি/ })).toBeVisible();
  await expect(main(page)).toContainText('টাকার অমিল: চাওয়া হয়েছিল ৳500, SMS-এ ৳450');
  await expect(main(page)).toContainText('লিসেনার ফোন 4 মিনিট আগে দেখা গেছে');
  await expect(main(page).getByRole('button', { name: 'ফোনের রিসিট' })).toBeVisible();
  await main(page).getByRole('button', { name: 'অ্যাপ্রুভ' }).first().click();
  await expect(sheet(page)).toContainText('কত টাকা এসেছে');
  expect(await page.locator('body').innerText()).not.toMatch(/\b(sp|lp)[A-Z][A-Za-z]+\b/);
});

test('fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(wide).toBeLessThanOrEqual(320);
  await tab(page, 'All').click();
  await expect(main(page).getByRole('button', { name: /9F2KQ7M1/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // The order number is whole, never cut off.
  const row = main(page).getByRole('button', { name: /9F2KQ7M1/ });
  await expect(row).toContainText('#261105-0039');
});

test('Home says how many wait, and goes there', async ({ page }) => {
  await mockApi(page, {
    language: 'en',
    shopPayments: drawnShopPayments(),
    paymentsToVerify: 4,
  });
  await page.goto(`/${SLUG}`);
  const job = page.getByRole('link', { name: /4 payments to verify/ });
  await expect(job).toBeVisible();
  await job.click();
  await expect(page).toHaveURL(`/${SLUG}/payments`);
});

test('uses the fixtures it is given', () => {
  // A guard on this file's own samples: Rumana's phone is the online one the first test reads.
  expect(RUMANA.online).toBe(true);
  expect(SHOP_PHONE.online).toBe(false);
});
