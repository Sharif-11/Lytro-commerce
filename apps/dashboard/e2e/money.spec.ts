import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import {
  AWAITING_RENEWAL,
  CHECKING_TOP_UP,
  drawnPayments,
  payment,
  rejectedRenewal,
} from './support/payments';

// TENANT-DASHBOARD-DESIGN §7.11 and §7.13, Slice 11.5b: Balance with its statement and top-up, Billing with every
// payment's state, and where a payment's state shows besides (Home's queue, the Plan and Balance banners). Each test
// runs on a phone and on a desktop (playwright.config.ts).

const settled = drawnPayments().slice(1);

async function open(page: Page, state: ShopState = {}, path = '/balance'): Promise<ApiLog> {
  const log = await mockApi(page, state);
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog');
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

test('shows the balance, its statement with each row named, and the chips that read several types', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/balance/ledger')) requests.push(request.url());
  });
  await open(page, { money: { payments: settled } });
  await expect(main(page).getByText('৳412').first()).toBeVisible();
  await expect(main(page).getByText('6 / 10')).toBeVisible();
  await expect(main(page).getByText('ব্যালেন্সে টাকা যোগ · TrxID 9F2KQ7')).toBeVisible();
  await expect(main(page).getByText('1 × ৳0.55', { exact: false }).first()).toBeVisible();
  await expect(main(page).getByText('পরে −৳85.85')).toBeVisible();

  await main(page).getByRole('button', { name: 'ফি', exact: true }).click();
  await expect(main(page).getByText('মেসেজ থেকে অর্ডার পড়া')).toBeVisible();
  await expect(main(page).getByText('ব্যালেন্সে টাকা যোগ · TrxID 9F2KQ7')).toHaveCount(0);
  const last = new URL(requests.at(-1) ?? '');
  expect(last.searchParams.get('type')).toBe('order_fee,product_fee,extraction,fraud_check');
  await expect(main(page).getByRole('link', { name: 'CSV' })).toHaveAttribute(
    'href',
    '/api/v1/balance/ledger/export?type=order_fee%2Cproduct_fee%2Cextraction%2Cfraud_check',
  );
});

test("says a top-up is being checked, or was rejected with support's note and Details", async ({
  page,
}) => {
  await open(page);
  await expect(
    main(page).getByRole('status').filter({ hasText: '৳500 টপ-আপ চেক হচ্ছে' }),
  ).toBeVisible();

  await page.unrouteAll();
  const rejected = payment({
    ...CHECKING_TOP_UP,
    id: 'pay_tu_x',
    state: 'rejected',
    note: 'TrxID মেলেনি।',
  });
  await open(page, { money: { payments: [rejected, ...settled] } });
  const banner = main(page).getByRole('alert');
  await expect(banner).toContainText('৳500 টপ-আপ রিজেক্ট হয়েছে: "TrxID মেলেনি।"');
  await expect(banner.getByRole('link', { name: 'বিস্তারিত' })).toHaveAttribute(
    'href',
    `/${SLUG}/billing/pay_tu_x`,
  );
});

test('warns of a low balance, with Top up', async ({ page }) => {
  await open(page, { money: { payments: settled, balance: '48.00' } });
  const banner = main(page).getByRole('alert').filter({ hasText: 'ব্যালেন্স ৳48' });
  await expect(banner).toContainText('৳50-এর নিচে নামলে');
  await banner.getByRole('button', { name: 'টপ-আপ' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'টপ-আপ' })).toBeVisible();
});

test('tops up: the amount, then the request on Continue and the wallet step', async ({ page }) => {
  const log = await open(page, { money: { payments: settled } }, '/balance?topup=1');
  await expect(sheet(page).getByText('৳100 থেকে ৳50,000')).toBeVisible();
  await sheet(page).getByRole('button', { name: '৳1,000' }).click();
  await expect(sheet(page).getByText('আজকের রেটে প্রায় 1,818টি SMS')).toBeVisible();
  expect(log.calls.some((call) => call.path === '/balance/top-up/quote')).toBe(false);
  await sheet(page).getByRole('button', { name: 'এগিয়ে যান · ৳1,000' }).click();
  await expect(sheet(page).getByLabel(/TrxID/)).toBeVisible();
  expect(log.sent('POST', '/balance/top-up/quote')).toEqual({ amount: 1000 });
  await sheet(page).getByLabel(/TrxID/).fill('7KQ2MZ11');
  await sheet(page).getByLabel('যে নম্বর থেকে পাঠিয়েছেন').fill('1711000231');
  await sheet(page).getByRole('button', { name: 'পেমেন্ট জমা দিন' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'আপনার পেমেন্ট যাচাই করা হচ্ছে' }),
  ).toBeVisible();
  expect(log.sent('POST', '/balance/top-up/confirm')).toMatchObject({
    paymentId: 'payment-1',
    transactionId: '7KQ2MZ11',
    amountPaid: 1000,
  });
});

test("a suspended owner's Balance: the balance and Top up only, and the way back", async ({
  page,
}) => {
  const log = await open(page, { money: { suspended: true } });
  await expect(page.getByText('৳412')).toBeVisible();
  await expect(page.getByRole('button', { name: 'টপ-আপ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'স্টেটমেন্ট' })).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  expect(log.calls.some((call) => call.path === '/balance/ledger')).toBe(false);
  await page.getByRole('link', { name: /ফিরে যান/ }).click();
  await expect(page.getByRole('heading', { name: 'দোকান এখন খোলা যাচ্ছে না' })).toBeVisible();
});

test("lists the shop's payments by month, filters them, and opens one", async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/billing/payments')) requests.push(request.url());
  });
  await open(page, {}, '/billing');
  await expect(main(page).getByRole('link', { name: /ব্যালেন্স টপ-আপ.*চেক হচ্ছে/ })).toBeVisible();
  await expect(main(page).getByText('আগের দোকান')).toBeVisible();
  await expect(
    main(page)
      .getByText(/From the balance|ব্যালেন্স থেকে/)
      .first(),
  ).toBeVisible();

  await main(page).getByRole('button', { name: 'পেইড', exact: true }).click();
  await expect
    .poll(() => new URL(requests.at(-1) ?? 'http://x').searchParams.get('state'))
    .toBe('paid');
  await expect(main(page).getByRole('link', { name: /চেক হচ্ছে/ })).toHaveCount(0);

  await main(page).getByRole('button', { name: 'সব', exact: true }).click();
  await main(page)
    .getByRole('link', { name: /Starter · 1 মাস · রিনিউ.*TrxID 5KD9QW/ })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/billing/pay_5kd9qw`);
  // The For line names the period the invoice covers.
  await expect(main(page).getByText(/^Starter · 1 মাস · \d+ [A-Z][a-z]+ – /)).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'INV-000214' })).toBeVisible();
  await expect(main(page).getByText('কনফার্ম · ইনভয়েস INV-000214')).toBeVisible();
});

test("a rejected payment quotes support, and Pay again opens How to pay at today's price", async ({
  page,
}) => {
  const log = await open(
    page,
    { money: { payments: [rejectedRenewal('bn'), ...settled] } },
    '/billing/pay_8m3pqr',
  );
  await expect(main(page).getByText(/সাপোর্টের নোট:/)).toBeVisible();
  await expect(main(page).getByText('লাইট্রো সাপোর্ট রিজেক্ট করেছে')).toBeVisible();
  await main(page).getByRole('button', { name: 'আবার পেমেন্ট করুন' }).click();
  await expect(sheet(page).getByRole('heading', { name: '৳449 কীভাবে দেবেন?' })).toBeVisible();
  expect(log.calls.some((call) => call.path === '/billing/quote')).toBe(false);
});

test('a request nothing was sent for: Finish paying by wallet, or Cancel it, charging nothing', async ({
  page,
}) => {
  const log = await open(
    page,
    { money: { payments: [AWAITING_RENEWAL, ...settled] } },
    `/billing/${AWAITING_RENEWAL.id}`,
  );
  await expect(
    main(page).getByText(/ঘণ্টার মধ্যে পেমেন্ট করুন, না হলে অনুরোধটি বাতিল হবে/),
  ).toBeVisible();
  await main(page).getByRole('button', { name: 'পেমেন্ট শেষ করুন' }).click();
  await sheet(page).getByLabel(/TrxID/).fill('9HA3RC11');
  await sheet(page).getByLabel('যে নম্বর থেকে পাঠিয়েছেন').fill('1711000231');
  await sheet(page).getByRole('button', { name: 'পেমেন্ট জমা দিন' }).click();
  await expect(sheet(page)).toBeHidden();
  expect(log.sent('POST', '/billing/purchase')).toMatchObject({
    paymentId: AWAITING_RENEWAL.id,
    method: 'wallet',
    transactionId: '9HA3RC11',
  });

  await main(page).getByRole('button', { name: 'এই পেমেন্ট বাতিল করুন' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'পেমেন্ট বাতিল হয়েছে। কিছু কাটা হয়নি।' }),
  ).toBeVisible();
  await expect(main(page).getByText('আপনি বাতিল করেছেন')).toBeVisible();
  expect(
    log.calls.some((call) => call.path === `/billing/payments/${AWAITING_RENEWAL.id}/cancel`),
  ).toBe(true);
});

test('a payment not among the recent ones says so; /invoices leads to Billing', async ({
  page,
}) => {
  await open(page, {}, '/billing/pay_unknown');
  await expect(
    main(page).getByText('এই পেমেন্টটি সাম্প্রতিক পেমেন্টের তালিকায় নেই।'),
  ).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'সব পেমেন্ট দেখুন' })).toHaveAttribute(
    'href',
    `/${SLUG}/billing`,
  );

  await page.goto(`/${SLUG}/invoices`);
  await expect(page).toHaveURL(`/${SLUG}/billing`);
});

test("a rejected payment heads Home's queue, and shows on Plan with Details", async ({ page }) => {
  const state: ShopState = {
    money: {
      payments: [rejectedRenewal('bn'), ...settled],
      needing: { id: 'pay_8m3pqr', kind: 'renewal', amount: '449.00', state: 'rejected' },
    },
  };
  await open(page, state, '');
  await expect(
    main(page).getByRole('link', { name: /৳449 পেমেন্ট রিজেক্ট হয়েছে · কারণ দেখুন/ }),
  ).toHaveAttribute('href', `/${SLUG}/billing/pay_8m3pqr`);

  await page.unrouteAll();
  await open(page, state, '/plan');
  const banner = main(page).getByRole('alert').first();
  await expect(banner).toContainText('৳449 পেমেন্ট রিজেক্ট হয়েছে:');
  await expect(banner.getByRole('link', { name: 'বিস্তারিত' })).toHaveAttribute(
    'href',
    `/${SLUG}/billing/pay_8m3pqr`,
  );
});

test('passes an accessibility check on Balance, the top-up sheet and Billing', async ({ page }) => {
  await open(page, { money: { payments: settled } });
  await page.waitForLoadState('networkidle');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'টপ-আপ' }).first().click();
  await expectAccessible(page);

  for (const path of ['/billing', '/billing/pay_5kd9qw']) {
    await page.unrouteAll();
    await open(page, {}, path);
    await page.waitForLoadState('networkidle');
    await expectAccessible(page);
  }
});
