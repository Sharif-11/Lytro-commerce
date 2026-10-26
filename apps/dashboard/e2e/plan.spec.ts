import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GROWTH, ONE_MONTH, STARTER } from './support/catalogue';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.12 and §7.20, Slice 11.5b: Plan with its sheets and banners, a pay-as-you-go shop's page,
// Renew and Unavailable. Every price is read without making a payment; a request is made only on the tap that commits,
// with the amount shown (BIL-09). Each test runs on a phone and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}, path = '/plan'): Promise<ApiLog> {
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

/** Whether any payment request was made yet. */
function quoted(log: ApiLog): boolean {
  return log.calls.some(
    (call) => call.path === '/billing/quote' || call.path === '/billing/upgrade/quote',
  );
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

test("shows a paid plan's card, its term, and each plan's one move, without asking for a payment", async ({
  page,
}) => {
  const log = await open(page);
  await expect(main(page).getByRole('heading', { name: 'Starter · 1 মাস' })).toBeVisible();
  await expect(main(page).getByText('আপনি এখানে')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'আপগ্রেড · ৳400 দিতে হবে' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'আপগ্রেড · ৳700 দিতে হবে' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'মেয়াদ শেষে বদলান' })).toBeVisible();
  await expect(main(page).getByText('অর্ডারে ৳20 বা 1.5% · প্রোডাক্টে ৳10')).toBeVisible();
  await expect(main(page).getByText('25টি প্রোডাক্ট')).toBeVisible();
  // Choosing another term reads that term's figures, still without a request.
  await main(page).getByRole('button', { name: '3 মাস · 5% ছাড়' }).click();
  await expect(main(page).getByText('৳1,280', { exact: true }).first()).toBeVisible();
  expect(quoted(log)).toBe(false);
  expect(log.calls.some((call) => call.path === '/billing/prices')).toBe(true);
});

test('renews by wallet: the request is made on Continue, with the amount shown', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: '৳449 দিয়ে রিনিউ করুন' }).click();
  // ৳412.50 does not cover ৳449, so the balance is greyed with why and the wallets are chosen.
  const fromBalance = sheet(page).getByRole('radio', { name: /ব্যালেন্স থেকে/ });
  await expect(fromBalance).toHaveAttribute('aria-disabled', 'true');
  await expect(fromBalance).toContainText('যথেষ্ট নেই; টপ-আপ করুন বা bKash বা Nagad দিয়ে দিন');
  await expect(sheet(page).getByRole('radio', { name: /^bKash বা Nagad দিয়ে/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(quoted(log)).toBe(false);

  await sheet(page).getByRole('button', { name: 'এগিয়ে যান · ৳449' }).click();
  await expect(sheet(page).getByLabel(/TrxID/)).toBeVisible();
  expect(log.sent('POST', '/billing/quote')).toEqual({
    planId: STARTER,
    billingTermId: ONE_MONTH,
    amount: 449,
  });
  await sheet(page).getByLabel(/TrxID/).fill('9F2KQ7X1');
  await sheet(page).getByLabel('যে নম্বর থেকে পাঠিয়েছেন').fill('1711234567');
  await sheet(page).getByRole('button', { name: 'পেমেন্ট জমা দিন' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'পেমেন্ট চেক করতে পাঠানো হয়েছে' }),
  ).toBeVisible();
  expect(log.sent('POST', '/billing/purchase')).toMatchObject({
    paymentId: 'payment-1',
    method: 'wallet',
    transactionId: '9F2KQ7X1',
    amountPaid: 449,
  });
});

test('renews from the balance on one tap when it covers the amount', async ({ page }) => {
  const log = await open(page, { money: { balance: '900.00' } });
  await main(page).getByRole('button', { name: '৳449 দিয়ে রিনিউ করুন' }).click();
  await expect(sheet(page).getByRole('radio', { name: /ব্যালেন্স থেকে/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet(page).getByRole('button', { name: 'ব্যালেন্স থেকে ৳449 দিন' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'রিনিউ হয়েছে · মেয়াদ' })).toBeVisible();
  expect(log.sent('POST', '/billing/quote')).toMatchObject({ amount: 449 });
  expect(log.sent('POST', '/billing/purchase')).toEqual({
    paymentId: 'payment-1',
    method: 'balance',
  });
});

test('upgrades, and says so when the amount changed before the tap, charging nothing', async ({
  page,
}) => {
  const log = await open(page, { money: { balance: '900.00', amountChangedTo: '415.00' } });
  await main(page).getByRole('button', { name: 'আপগ্রেড · ৳400 দিতে হবে' }).click();
  await expect(sheet(page).getByText('Starter-এর বাকি 20 দিনের ক্রেডিট')).toBeVisible();
  await expect(
    sheet(page).getByText('প্রোডাক্ট 100 → 1,000 · সিট 2 → 5 · অর্ডার 300 → 1,500'),
  ).toBeVisible();
  await sheet(page).getByRole('button', { name: 'ব্যালেন্স থেকে ৳400 দিন' }).click();

  await expect(sheet(page).getByRole('alert')).toHaveText(
    'অ্যামাউন্ট এখন ৳415। দেখে নিয়ে আবার পেমেন্ট করুন।',
  );
  await expect(sheet(page).getByText('−৳284')).toBeVisible();
  expect(log.calls.some((call) => call.path === '/billing/upgrade/confirm')).toBe(false);

  await sheet(page).getByRole('button', { name: 'ব্যালেন্স থেকে ৳415 দিন' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Growth চালু হয়েছে' })).toBeVisible();
  expect(log.sent('POST', '/billing/upgrade/quote')).toMatchObject({ planId: GROWTH, amount: 415 });
  expect(log.sent('POST', '/billing/upgrade/confirm')).toEqual({
    paymentId: 'payment-1',
    method: 'balance',
  });
});

test('moves down at the period end, after saying what would be over the limit', async ({
  page,
}) => {
  const log = await open(page, {
    money: {
      plan: GROWTH,
      over: [
        { key: 'staff', used: 4, limit: 2 },
        { key: 'products', used: 340, limit: 100 },
      ],
    },
  });
  await main(page).getByRole('button', { name: 'মেয়াদ শেষে নামুন' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Starter-এ নামুন' })).toBeVisible();
  await expect(sheet(page).getByText('340 / 100')).toBeVisible();
  await expect(sheet(page).getByText('4 / 2')).toBeVisible();
  await expect(sheet(page).getByText(/100-র মধ্যে আসে/)).toBeVisible();
  await sheet(page)
    .getByRole('button', { name: /-এ নামুন$/ })
    .click();
  await expect(sheet(page)).toBeHidden();
  expect(log.sent('POST', '/billing/downgrade/schedule')).toEqual({ planId: STARTER });
});

test("stops the subscription at the period's end, naming each step's day", async ({ page }) => {
  const log = await open(page);
  await main(page).getByText('সাবস্ক্রিপশন বন্ধ করতে চান?').click();
  await expect(
    main(page).getByText(/3 দিন পর শুধু দেখা যাবে, 60 দিন পর ডেটা মুছে যাবে/),
  ).toBeVisible();
  await main(page).getByRole('button', { name: 'মেয়াদ শেষে ক্যানসেল' }).click();
  for (const step of [
    /মেয়াদ শেষ, 3 দিন গ্রেস/,
    /^3 দিন পর: শুধু দেখা যাবে/,
    /^7 দিন পর: লক/,
    /^60 দিন পর: দোকানের ডেটা/,
  ]) {
    await expect(sheet(page).getByText(step)).toBeVisible();
  }
  await sheet(page)
    .getByRole('button', { name: /-এ বন্ধ করুন$/ })
    .click();
  await expect(sheet(page)).toBeHidden();
  expect(log.calls.some((call) => call.method === 'POST' && call.path === '/billing/cancel')).toBe(
    true,
  );
});

test('a stopping subscription says when it ends, and is undone from the banner or the card', async ({
  page,
}) => {
  const log = await open(page, { money: { cancelled: true } });
  await expect(main(page).getByRole('alert')).toContainText('সাবস্ক্রিপশন');
  await expect(main(page).getByRole('button', { name: 'রাখুন' })).toBeVisible();
  await expect(main(page).getByText('ব্যালেন্স থেকে অটো-রিনিউ')).toHaveCount(0);
  await main(page).getByRole('button', { name: 'ফিরিয়ে নিন' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ফিরিয়ে নেওয়া হয়েছে' })).toBeVisible();
  expect(log.calls.some((call) => call.path === '/billing/cancel/undo')).toBe(true);
});

test('a scheduled move down says what will be over the limit, and keeps the plan on request', async ({
  page,
}) => {
  const log = await open(page, {
    money: {
      plan: GROWTH,
      scheduled: { kind: 'downgrade', targetPlanId: STARTER },
      over: [{ key: 'products', used: 340, limit: 100 }],
    },
  });
  const banner = main(page).getByRole('alert');
  await expect(banner).toContainText('Growth থেকে Starter-এ নামছে · 1টা লিমিটের উপরে থাকবে');
  await expect(banner).toContainText('প্রোডাক্ট 340 / 100');
  await banner.getByRole('button', { name: 'Growth রাখুন' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Growth থাকছে' })).toBeVisible();
  expect(log.calls.some((call) => call.path === '/billing/downgrade/cancel')).toBe(true);
});

test('switches to pay-as-you-go at the period end, with the limits that fall', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'মেয়াদ শেষে বদলান' }).click();
  await expect(
    sheet(page).getByText(
      'লিমিট নামবে: প্রোডাক্ট 100 → 25 · সিট 2 → 1 · স্টোরেজ 2 GB → 250 MB · ব্যান্ডউইথ 30 GB → 10 GB',
    ),
  ).toBeVisible();
  await sheet(page)
    .getByRole('button', { name: /-এ পে-অ্যাজ-ইউ-গো$/ })
    .click();
  await expect(sheet(page)).toBeHidden();
  expect(log.calls.some((call) => call.path === '/billing/pay-as-you-go')).toBe(true);
});

test('a trial picks a plan, and nobody without payments:manage is offered a move', async ({
  page,
}) => {
  await open(page, { state: 'trial', periodEndDays: 27 });
  await expect(main(page).getByRole('heading', { name: 'ট্রায়াল' })).toBeVisible();
  await main(page).getByRole('button', { name: 'Starter নিন' }).click();
  await expect(sheet(page).getByRole('heading', { name: '৳449 কীভাবে দেবেন?' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.unrouteAll();
  await open(page, { isOwner: false, permissions: ['payments:read'] });
  await expect(main(page).getByText('আপনি এখানে')).toBeVisible();
  await expect(main(page).getByRole('button', { name: /দিতে হবে|নামুন|রিনিউ/ })).toHaveCount(0);
});

test("a pay-as-you-go shop's page: this month's fees, the balance, the rates and closing", async ({
  page,
}) => {
  const log = await open(page, { state: 'pay_as_you_go' });
  await expect(main(page).getByRole('heading', { name: 'পে-অ্যাজ-ইউ-গো' })).toBeVisible();
  await expect(main(page).getByText('৳612')).toBeVisible();
  await expect(main(page).getByText('৳412.50')).toBeVisible();
  await expect(main(page).getByText('25টি প্রোডাক্ট · 1টি সিট · 250 MB · 10 GB')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Starter নিন' })).toBeVisible();
  await main(page).getByText('দোকান বন্ধ করা').click();
  await main(page).getByRole('button', { name: 'দোকান বন্ধ করুন' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'বন্ধ করুন' }).click();
  await expect.poll(() => log.calls.some((call) => call.path === '/billing/close')).toBe(true);
});

test('a locked shop has only Renew, which renews, takes pay-as-you-go or exports', async ({
  page,
}) => {
  const log = await open(
    page,
    { state: 'locked', periodEndDays: -9, money: { hasEmail: true } },
    '/products',
  );
  await expect(page).toHaveURL(`/${SLUG}/renew`);
  await expect(page.getByRole('heading', { name: 'মেঘ ফ্যাশন · দোকান লকড' })).toBeVisible();
  await expect(page.getByText(/^প্ল্যান 9 দিন আগে শেষ হয়েছে।/)).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);

  await page.getByRole('button', { name: 'ডেটা এক্সপোর্ট করুন' }).click();
  await expect(
    page.getByRole('button', { name: 'এক্সপোর্ট তৈরি হচ্ছে · ইমেইলে জানাবো' }),
  ).toBeDisabled();
  expect(log.calls.some((call) => call.method === 'POST' && call.path === '/exports')).toBe(true);

  await page.getByRole('button', { name: 'পে-অ্যাজ-ইউ-গো নিন (পেমেন্ট লাগে না)' }).click();
  await expect
    .poll(() => log.calls.some((call) => call.path === '/billing/pay-as-you-go'))
    .toBe(true);
  await page.getByRole('button', { name: '৳449 দিয়ে রিনিউ করুন' }).click();
  await expect(sheet(page).getByRole('heading', { name: '৳449 কীভাবে দেবেন?' })).toBeVisible();
});

test("an archived shop's Renew says until when its data is kept, and offers a ready export", async ({
  page,
}) => {
  const ready = new Date().toISOString();
  await open(
    page,
    {
      state: 'archived',
      periodEndDays: -20,
      money: {
        deletesInDays: 40,
        exports: [
          {
            id: 'export-9',
            status: 'ready',
            fileSizeBytes: 18 * 1024 * 1024,
            requestedAt: ready,
            readyAt: ready,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
        ],
      },
    },
    '/renew',
  );
  await expect(page.getByRole('heading', { name: 'মেঘ ফ্যাশন · দোকান আর্কাইভড' })).toBeVisible();
  await expect(
    page.getByText(/^প্ল্যান 20 দিন আগে শেষ হয়েছে। ডেটা \d+ \S+ \d{4} পর্যন্ত রাখা আছে/),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'এক্সপোর্ট ডাউনলোড করুন (18 MB) · 24 ঘণ্টা থাকবে' }),
  ).toHaveAttribute('href', '/api/v1/exports/export-9/download');
  await expect(page.getByRole('button', { name: 'লগআউট' })).toBeVisible();
});

test('a suspended shop shows Unavailable, with support and the balance', async ({ page }) => {
  await open(page, { money: { suspended: true } }, '');
  await expect(page.getByRole('heading', { name: 'দোকান এখন খোলা যাচ্ছে না' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ব্যালেন্স দেখুন' })).toHaveAttribute(
    'href',
    `/${SLUG}/balance`,
  );
  await expect(page.getByRole('link', { name: 'সাপোর্টে লিখুন' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'লগআউট' })).toBeVisible();
});

test('a shop that is not lapsed is sent from Renew to Plan', async ({ page }) => {
  await open(page, {}, '/renew');
  await expect(page).toHaveURL(`/${SLUG}/plan`);
});

test('passes an accessibility check on Plan, its sheets, pay-as-you-go, Renew and Unavailable', async ({
  page,
}) => {
  await open(page);
  await page.waitForLoadState('networkidle');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: '৳449 দিয়ে রিনিউ করুন' }).click();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await main(page).getByRole('button', { name: 'আপগ্রেড · ৳400 দিতে হবে' }).click();
  await expectAccessible(page);

  for (const [state, path] of [
    [{ state: 'pay_as_you_go' }, '/plan'],
    [{ state: 'locked', periodEndDays: -9 }, '/renew'],
    [{ money: { suspended: true } }, ''],
  ] as [ShopState, string][]) {
    await page.unrouteAll();
    await open(page, state, path);
    await page.waitForLoadState('networkidle');
    await expectAccessible(page);
  }
});
