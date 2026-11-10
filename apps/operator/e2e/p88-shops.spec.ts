import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addonPayment, drawnPayments, MEHEDI, RAHIM } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN v7 §5 (Phase 8 Slice 8.8): the shop list's filters, sorts and the owner's phone (ADM-02, D8-7,
// D8-24); the shop page's figures and the lists behind them (ADM-03); extending, resetting the owner's sign-in and
// deleting a shop's data (ADM-04, ADM-13).

const SADIA = 'ten-0019';
const KEYA = 'ten-0028';

async function openShop(page: Page, id = RAHIM, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto(`/shops/${id}`);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  return log;
}

function dialog(page: Page, name: string | RegExp) {
  return page.getByRole('dialog', { name });
}

function figure(page: Page, label: string) {
  return page.getByRole('main').getByRole('button').filter({ hasText: label });
}

test.describe('the list', () => {
  test('filters by state and plan, sorts, and the address keeps them', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/shops');
    const main = page.getByRole('main');
    await main.getByLabel('Plan').selectOption('p-starter');
    await expect(page).toHaveURL('/shops?planId=p-starter');
    await main.getByLabel('Sort').selectOption('period_end');
    await expect(page).toHaveURL('/shops?planId=p-starter&sort=period_end');
    const names = main.getByRole('link').filter({ hasText: /\w/ });
    await expect(names).toHaveText([
      'Lal Sabuj Grocery',
      'Keya Boutique',
      'Sadia Collection',
      'Joy Pharmacy',
      'Rahim Fashion',
    ]);
    expect(log.calls.at(-1)?.query).toContain('planId=p-starter');
    expect(log.calls.at(-1)?.query).toContain('sort=period_end');
    await main.getByLabel('State').selectOption('grace');
    await expect(names).toHaveText(['Sadia Collection']);
    await main.getByLabel('State').selectOption('');
    await main.getByLabel('Sort').selectOption('newest');
    await expect(page).toHaveURL('/shops?planId=p-starter');
  });

  test("finds a shop by its owner's phone, written any way, and says how", async ({ page }) => {
    await mockApi(page);
    await page.goto('/shops?q=345678');
    const main = page.getByRole('main');
    await expect(main.getByText("Searching owners' phones too.", { exact: false })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Sadia Collection' })).toBeVisible();
    await expect(main.getByText('01815 345678')).toBeVisible();
    await page.goto('/shops?q=%2B880%201712-345678');
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Sadia Collection' })).toHaveCount(0);
    await page.goto('/shops?q=rahim');
    await expect(main.getByRole('link', { name: 'Rahim Fashion' })).toBeVisible();
    await expect(main.getByText("Searching owners' phones too.", { exact: false })).toHaveCount(0);
  });
});

test.describe("a shop's figures", () => {
  test('opens with the shop as it is now, read inside it', async ({ page }) => {
    await openShop(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'This shop now' })).toBeVisible();
    await expect(figure(page, 'Server errors, 24 h')).toContainText('3');
    await expect(figure(page, "SMS that didn't go")).toContainText(
      "2 failed · 1 blocked · 1 of Lytro's",
    );
    await expect(figure(page, 'Waiting for you')).toContainText(
      '৳99 to Lytro · 2 shopper payments wait for the seller',
    );
    await expect(main.getByText('Not frozen · ৳0 held')).toBeVisible();
    await expect(main.getByText('512 of 600')).toBeVisible();
    await expect(main.getByText('1.3 GB of 2.0 GB')).toBeVisible();
    await expect(main.getByText('Address reads: 4 outside the allowance, ৳8')).toBeVisible();
    await expect(main.getByText('Karim Hossain')).toBeVisible();
    await expect(main.getByText('Never', { exact: true })).toBeVisible();
    await expect(main.getByText('Delivered182')).toBeVisible();
  });

  test('a lapsed shop shows its balance frozen', async ({ page }) => {
    await openShop(page, SADIA);
    await expect(page.getByRole('main').getByText('Frozen')).toBeVisible();
  });

  test('each list loads when its figure is opened', async ({ page }) => {
    const log = await openShop(page);
    expect(log.calls.some((call) => call.path.endsWith('/errors'))).toBe(false);
    await figure(page, 'Server errors, 24 h').click();
    const errors = dialog(page, 'Server errors · Rahim Fashion');
    await expect(errors.getByText('K7MQ-4XR2')).toBeVisible();
    await expect(errors.getByText('POST /api/v1/orders/:id/courier-booking')).toBeVisible();
    await expect(errors.getByText('Never the message', { exact: false })).toBeVisible();
    await errors.getByRole('button', { name: 'Close' }).click();

    await figure(page, "SMS that didn't go").click();
    const sms = dialog(page, "SMS that didn't go · Rahim Fashion");
    await expect(sms.getByText('#261018-0044 · 1 units · balance too low')).toBeVisible();
    await expect(sms.getByText('01715 000111 · 3 tries')).toBeVisible();
    await sms.getByRole('button', { name: 'Close' }).click();

    await figure(page, 'Failed courier calls').click();
    const courier = dialog(page, 'Failed courier calls · Rahim Fashion');
    await expect(courier.getByText('#261021-0031')).toBeVisible();
    await courier.getByRole('button', { name: 'The whole courier key log' }).click();
    await expect(page).toHaveURL(`/shops/${RAHIM}/courier-keys`);
  });

  test('a payment waiting opens in the queue; the sales open by period', async ({ page }) => {
    const log = await openShop(page, RAHIM, { payments: [addonPayment(), ...drawnPayments()] });
    await page.getByRole('button', { name: 'Open sales' }).click();
    const sales = dialog(page, 'Sales · Rahim Fashion');
    await expect(sales.getByText('৳216,000')).toBeVisible();
    expect(log.calls.at(-1)?.query).toContain('dateFrom=2026-10-01');
    await sales.getByRole('button', { name: 'Last month' }).click();
    await expect.poll(() => log.calls.at(-1)?.query).toContain('dateFrom=2026-09-01');
    expect(log.calls.at(-1)?.query).toContain('dateTo=2026-09-30');
    await sales.getByRole('button', { name: 'This year' }).click();
    await expect.poll(() => log.calls.at(-1)?.query).toContain('bucket=month');
    await sales.getByRole('button', { name: 'Close' }).click();

    await figure(page, 'Waiting for you').click();
    await dialog(page, 'Waiting for you · Rahim Fashion')
      .getByRole('button', { name: /Add-on · ৳99/ })
      .click();
    await expect(page).toHaveURL(/\/queue\/pay-/);
  });

  test('the latest actions on the shop open the audit log at it', async ({ page }) => {
    await openShop(page);
    const main = page.getByRole('main');
    await expect(
      main.getByText('−৳150 · SMS charged twice on 18 Oct · 20 Oct 2026 · ops@lytro.app'),
    ).toBeVisible();
    await expect(main.getByText('The shop owner', { exact: false })).toBeVisible();
    await main.getByRole('button', { name: 'Open in the audit log' }).click();
    await expect(page).toHaveURL(`/audit?tenantId=${RAHIM}`);
  });
});

test.describe('extending', () => {
  test('adds whole days with a reason, and says where the period now ends', async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Extend', exact: true }).click();
    const panel = dialog(page, "Extend Rahim Fashion's period");
    await panel.getByLabel('Days to add').fill('14');
    await expect(
      panel.getByText('Ends 28 Nov 2026 instead of 14 Nov 2026', { exact: false }),
    ).toBeVisible();
    const send = panel.getByRole('button', { name: 'Extend by 14 days' });
    await expect(send).toBeDisabled();
    await panel.getByLabel('Days to add').fill('31');
    await expect(panel.getByRole('button', { name: 'Extend', exact: true })).toBeDisabled();
    await panel.getByLabel('Days to add').fill('14');
    await panel.getByRole('textbox', { name: 'Reason' }).fill('bKash was down');
    await send.click();
    await expect(
      page.getByRole('status').getByText('Plan extended. Rahim Fashion now ends 28 Nov 2026.'),
    ).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/extend`)).toEqual({
      days: 14,
      reason: 'bKash was down',
    });
  });

  test('a lapsed shop comes back to active', async ({ page }) => {
    await openShop(page, SADIA);
    await page.getByRole('button', { name: 'Extend', exact: true }).click();
    const panel = dialog(page, "Extend Sadia Collection's period");
    await expect(panel.getByText('Sadia Collection is in Grace:')).toBeVisible();
    await panel.getByRole('textbox', { name: 'Reason' }).fill('bKash was down');
    await panel.getByRole('button', { name: 'Extend by 7 days' }).click();
    await expect(page.getByRole('status').getByText('now ends 26 Oct 2026')).toBeVisible();
    await expect(page.getByRole('main').getByText('Active').first()).toBeVisible();
  });

  test('days that still end in the past are refused, and a plan offered instead', async ({
    page,
  }) => {
    await openShop(page, KEYA);
    await page.getByRole('button', { name: 'Extend', exact: true }).click();
    const panel = dialog(page, "Extend Keya Boutique's period");
    await expect(panel.getByText('Those days still end in the past.')).toBeVisible();
    await panel.getByLabel('Days to add').fill('20');
    await expect(panel.getByText('Those days still end in the past.')).toHaveCount(0);
    await panel.getByLabel('Days to add').fill('7');
    await panel.getByRole('button', { name: 'Assign a plan instead' }).click();
    await expect(dialog(page, 'Assign a plan')).toBeVisible();
  });

  test("isn't offered to a pay-as-you-go shop, which has no period", async ({ page }) => {
    await openShop(page, MEHEDI);
    await expect(page.getByRole('button', { name: 'Extend', exact: true })).toHaveCount(0);
  });
});

test.describe("the owner's sign-in", () => {
  test("resets to the account's phone by default, signing the owner out", async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Reset sign-in' }).click();
    const panel = dialog(page, "Reset the owner's sign-in");
    await expect(panel.getByText('Rahim Fashion · Rahim Uddin')).toBeVisible();
    await expect(panel.getByLabel('The phone the owner gave you')).toHaveValue('01712 345678');
    await expect(panel.getByText("This isn't the account's number")).toHaveCount(0);
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Lost the phone');
    await panel.getByRole('button', { name: 'Sign out and send the code' }).click();
    await expect(page.getByRole('status').getByText('The owner is signed out')).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/owner-reset`)).toEqual({
      phone: '01712345678',
      reason: 'Lost the phone',
    });
  });

  test("a new phone replaces the account's, in any written form", async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Reset sign-in' }).click();
    const panel = dialog(page, "Reset the owner's sign-in");
    await panel.getByLabel('The phone the owner gave you').fill('+880 1819-445566');
    await expect(panel.getByText("This isn't the account's number:")).toBeVisible();
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Lost the phone');
    await panel.getByRole('button', { name: 'Sign out and send the code' }).click();
    await expect(page.getByRole('status').getByText('The owner is signed out')).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/owner-reset`)).toEqual({
      phone: '01819445566',
      reason: 'Lost the phone',
    });
  });

  test("refuses a phone that isn't one, and one on another account", async ({ page }) => {
    await openShop(page);
    await page.getByRole('button', { name: 'Reset sign-in' }).click();
    const panel = dialog(page, "Reset the owner's sign-in");
    await panel.getByLabel('The phone the owner gave you').fill('12345');
    await expect(panel.getByText('Not a Bangladeshi mobile number.')).toBeVisible();
    await panel.getByLabel('The phone the owner gave you').fill('01611 223300');
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Lost the phone');
    await panel.getByRole('button', { name: 'Sign out and send the code' }).click();
    await expect(panel.getByText('This phone number is on another Lytro account.')).toBeVisible();
  });
});

test.describe("deleting a shop's data", () => {
  test('waits for the address, then takes the shop offline', async ({ page }) => {
    const log = await openShop(page);
    await page.getByRole('button', { name: 'Delete data' }).click();
    const panel = dialog(page, "Delete Rahim Fashion's data?");
    const send = panel.getByRole('button', { name: 'Delete the data' });
    await panel.getByRole('textbox', { name: 'Reason' }).fill('The owner asked by email');
    await expect(send).toBeDisabled();
    await panel.getByLabel("Type the shop's address to confirm").fill('rahim-fash');
    await expect(panel.getByText("That isn't this shop's address.")).toHaveCount(0);
    await panel.getByLabel("Type the shop's address to confirm").fill('rahim-fashions');
    await expect(panel.getByText("That isn't this shop's address.")).toBeVisible();
    await expect(send).toBeDisabled();
    await panel.getByLabel("Type the shop's address to confirm").fill('rahim-fashion');
    await send.click();
    await expect(
      page.getByRole('status').getByText('Rahim Fashion is offline. Its data is being deleted.'),
    ).toBeVisible();
    await expect(page.getByRole('main').getByText('Archived').first()).toBeVisible();
    expect(log.sent('POST', `/operator/tenants/${RAHIM}/delete-data`)).toEqual({
      confirmAddress: 'rahim-fashion',
      reason: 'The owner asked by email',
    });
  });
});

test('in Bangla, the figures and actions are too', async ({ page }) => {
  await openShop(page, RAHIM, { language: 'bn' });
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'শপটি এখন' })).toBeVisible();
  await expect(main.getByText('ওনারের লগইন আর শপের ডেটা')).toBeVisible();
  await expect(page.getByRole('button', { name: 'মেয়াদ বাড়ান' })).toBeVisible();
});

test('has no accessibility problems, with a panel open too', async ({ page }) => {
  await openShop(page);
  await expect(page.getByText('Karim Hossain')).toBeVisible();
  const page1 = await new AxeBuilder({ page }).analyze();
  expect(page1.violations).toEqual([]);
  await page.getByRole('button', { name: 'Delete data' }).click();
  await expect(dialog(page, "Delete Rahim Fashion's data?")).toBeVisible();
  const panel = await new AxeBuilder({ page }).analyze();
  expect(panel.violations).toEqual([]);
});
