import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DAY_ONE, mockApi, refusal, SLUG, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.1, Slice 11.4b: Home -- the queue of what needs the person, the shop's figures, the
// owner's set-up checklist (open on day one, folded once its first group is done) and the shop's link. Each test runs
// on a phone and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<void> {
  await mockApi(page, state);
  await page.goto(`/${SLUG}`);
}

function main(page: Page) {
  return page.getByRole('main');
}

/** The queue's rows, under "To do today". */
function jobs(page: Page) {
  return main(page).getByRole('region', { name: 'আজকের কাজ' }).getByRole('link');
}

test('shows a working shop: its jobs, its figures, the folded checklist and the link', async ({
  page,
}) => {
  await open(page);
  await expect(jobs(page)).toHaveText(['2টি প্রোডাক্টের স্টক কম বা শেষ2', '৳500 টপ-আপ চেক হচ্ছে']);
  await expect(jobs(page).first()).toHaveAttribute('href', `/${SLUG}/stock`);
  await expect(jobs(page).nth(1)).toHaveAttribute('href', `/${SLUG}/balance`);

  for (const text of ['5টি অ্যাক্টিভ', '1টি শেষ', '৳412.50', '6/10 SMS', 'প্ল্যানের দিন বাকি']) {
    await expect(main(page).getByText(text, { exact: true })).toBeVisible();
  }

  // The first group is done, so the checklist is one row; tapping it opens the list for this visit.
  const folded = main(page).getByRole('button', { name: /শপ প্রস্তুত করুন · 5\/5 হয়েছে/ });
  await expect(folded).toContainText('পরে, দরকার হলে: কুরিয়ার কানেক্ট করুন');
  await folded.click();
  await expect(main(page).getByRole('heading', { name: 'শপ প্রস্তুত করুন' })).toBeVisible();
  await expect(main(page).getByText('ঢাকা সিটির ভেতরে ৳70 · বাইরে ৳130')).toBeVisible();

  await expect(main(page).getByRole('heading', { name: 'আপনার শপের লিংক' })).toBeVisible();
});

test('opens a new shop on its checklist, with nothing in the queue yet (SUP-01)', async ({
  page,
}) => {
  await open(page, DAY_ONE);
  await expect(main(page).getByRole('heading', { name: 'শপ প্রস্তুত করুন' })).toBeVisible();
  await expect(main(page).getByText('2/5 হয়েছে')).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'প্রথম প্রোডাক্ট যোগ করুন' })).toHaveAttribute(
    'href',
    `/${SLUG}/products/new`,
  );
  await expect(main(page).getByRole('link', { name: 'শপের লিংক শেয়ার করুন' })).toHaveAttribute(
    'href',
    '#shop-link',
  );
  // The wallet number and the listener come with Phase 5, the courier with 6, SMS events with 7.
  await expect(main(page).getByText('ফেজ 5-এ আসছে')).toHaveCount(2);
  await expect(main(page).getByText('ফেজ 6-এ আসছে')).toBeVisible();
  await expect(main(page).getByText('ফেজ 7-এ আসছে')).toBeVisible();

  await expect(main(page).getByText('সব কাজ শেষ। নতুন অর্ডার এলে এখানে দেখাবে।')).toBeVisible();
  await expect(main(page).getByText('ট্রায়ালের দিন বাকি')).toBeVisible();
  await expect(main(page).getByText('27', { exact: true })).toBeVisible();
  // No low-stock figure before there is a product to run low.
  await expect(main(page).getByText('স্টক কম', { exact: true })).toHaveCount(0);
});

test('records the link as shared when it is copied, and shares it to Facebook and WhatsApp', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, DAY_ONE);
  const card = main(page).locator('#shop-link');
  const shared = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/home/link-shared'),
  );
  await card.getByRole('button', { name: 'কপি' }).click();
  await shared;
  await expect(card.getByRole('button', { name: 'কপি হয়েছে' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https:\/\/megh\./);

  const address = encodeURIComponent(await page.evaluate(() => navigator.clipboard.readText()));
  await expect(card.getByRole('link', { name: 'Facebook' })).toHaveAttribute(
    'href',
    `https://www.facebook.com/sharer/sharer.php?u=${address}`,
  );
  await expect(card.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    `https://wa.me/?text=${address}`,
  );
  await expect(card.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('target', '_blank');
});

test('lists every kind of job in the design order', async ({ page }) => {
  await open(page, {
    state: 'trial',
    periodEndDays: 3,
    home: {
      stock: { low: 2, out: 1, expiringBatches: 4 },
      paymentsBeingChecked: { count: 1, amount: '2990.00' },
      balance: { amount: '12.50', low: true, freeSms: { used: 10, limit: 10 } },
      staffWithoutPassword: 2,
    },
  });
  await expect(jobs(page)).toHaveText([
    '3টি প্রোডাক্টের স্টক কম বা শেষ3',
    '4টি ব্যাচ 30 দিনে এক্সপায়ার হবে4',
    '৳500 টপ-আপ চেক হচ্ছে',
    'প্ল্যানের পেমেন্ট চেক হচ্ছে',
    'ব্যালেন্স ৳12.50, SMS বন্ধ হতে পারে',
    'ট্রায়াল 3 দিনে শেষ',
    '2 জন স্টাফ এখনো পাসওয়ার্ড সেট করেনি2',
  ]);
  await expect(jobs(page).last()).toHaveAttribute('href', `/${SLUG}/team`);
});

test('shows a staff member only the parts their role reaches (STF-11)', async ({ page }) => {
  await open(page, {
    isOwner: false,
    permissions: ['inventory:read'],
    home: {
      balance: null,
      topUpsBeingChecked: null,
      paymentsBeingChecked: null,
      staffWithoutPassword: null,
    },
  });
  await expect(jobs(page)).toHaveText(['2টি প্রোডাক্টের স্টক কম বা শেষ2']);
  await expect(main(page).getByText('স্টক কম', { exact: true })).toBeVisible();
  // No balance, no plan days, and no set-up checklist, which is the owner's.
  await expect(main(page).getByText('ব্যালেন্স', { exact: true })).toHaveCount(0);
  await expect(main(page).getByText('প্ল্যানের দিন বাকি')).toHaveCount(0);
  await expect(main(page).getByText(/শপ প্রস্তুত করুন/)).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'আপনার শপের লিংক' })).toBeVisible();
});

test('leaves out the days left on pay-as-you-go, which has no period', async ({ page }) => {
  await open(page, { state: 'pay_as_you_go' });
  await expect(main(page).getByText('৳412.50')).toBeVisible();
  await expect(main(page).getByText('প্ল্যানের দিন বাকি')).toHaveCount(0);
});

test('warns above everything when a key spends fast (RTE-12)', async ({ page }) => {
  await open(page, { home: { fastSpendAlertedAt: new Date().toISOString() } });
  await expect(
    main(page).getByText(/^গত এক ঘণ্টায় এই সাইকেলের 5%-এর বেশি রিকোয়েস্ট গেছে।/),
  ).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'কী দেখুন' })).toHaveAttribute(
    'href',
    `/${SLUG}/settings`,
  );
});

test('says when Home could not be read, and tries again', async ({ page }) => {
  await mockApi(page);
  let failing = true;
  await page.route('**/api/v1/home', async (route) => {
    if (!failing) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: refusal('internal_error', 'কিছু একটা ভুল হয়েছে।'),
    });
  });
  await page.goto(`/${SLUG}`);
  const retry = main(page).getByRole('button', { name: 'আবার ট্রাই করুন' });
  // React Query tries three more times before it gives up.
  await expect(retry).toBeVisible({ timeout: 15_000 });
  failing = false;
  await retry.click();
  await expect(jobs(page)).toHaveCount(2);
  await expect(retry).toHaveCount(0);
});

test('passes an accessibility check on a working shop and on day one', async ({ page }) => {
  for (const state of [{}, DAY_ONE]) {
    await open(page, state);
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map(
        (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
    await page.unrouteAll();
  }
});
