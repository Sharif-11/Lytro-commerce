import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.34, Slice 4.8d (the prototype's Part 32; STA-01 to STA-04, INV-18): the Orders hub's Sales,
// the period and its split, the figures, profit for whoever may see costs, best sellers, a product's trend, and profit
// beside stock value. The clock is the sketch's last day of October. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00+06:00'));
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');

const asked = (log: ApiLog, path: string): string[] =>
  log.calls.filter((call) => call.path === path).map((call) => call.query);

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

/** Opens the period's sheet from its button. */
async function openPeriod(page: Page, current: RegExp): Promise<ReturnType<Page['getByRole']>> {
  await main(page).getByRole('button', { name: current }).click();
  return page.getByRole('dialog', { name: 'Period' });
}

test('Sales shows the month by week: the figures, each week, profit, best sellers, what counts', async ({
  page,
}) => {
  const log = await open(page, '/sales');
  await expect(main(page).getByRole('button', { name: /This month · 1–31 Oct/ })).toBeVisible();
  await expect(main(page).getByRole('radio', { name: 'Week' })).toBeChecked();
  await expect(main(page)).toContainText('212');
  await expect(main(page)).toContainText('৳348,600');
  await expect(main(page)).toContainText('Includes tax ৳12,480');
  await expect(main(page)).toContainText('৳14,700');
  await expect(main(page)).toContainText('Not in revenue');
  await expect(main(page)).toContainText('Revenue by week');
  await expect(main(page)).toContainText('3–9 Oct · 48 orders');
  await expect(main(page)).toContainText('31 Oct · 6 orders');
  await expect(main(page)).toContainText('৳137,720');
  await expect(main(page)).toContainText('3 sales had no cost recorded');
  await expect(main(page)).toContainText('Delivered orders, each on the day it was placed');
  expect(asked(log, '/sales')[0]).toContain('dateFrom=2026-10-01&dateTo=2026-10-31&bucket=week');
  await expectAccessible(page);
});

test('the split follows the period; the seller can change it, until the period changes', async ({
  page,
}) => {
  const log = await open(page, '/sales');
  let sheet = await openPeriod(page, /This month/);
  await sheet.getByRole('radio', { name: 'This year' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByRole('button', { name: /This year · Jan–Oct/ })).toBeVisible();
  await expect(main(page).getByRole('radio', { name: 'Month' })).toBeChecked();
  await expect(main(page)).toContainText('Revenue by month');
  expect(asked(log, '/sales').at(-1)).toContain(
    'dateFrom=2026-01-01&dateTo=2026-10-31&bucket=month',
  );

  await main(page).getByRole('radio', { name: 'Quarter' }).click();
  await expect(main(page)).toContainText('Revenue by quarter');
  await expect(main(page)).toContainText('Jan–Mar · 413 orders');
  await expect(page).toHaveURL(/bucket=quarter/);
  // Kept on reload: the address holds it.
  await page.reload();
  await expect(main(page).getByRole('radio', { name: 'Quarter' })).toBeChecked();

  sheet = await openPeriod(page, /This year/);
  await sheet.getByRole('radio', { name: 'Last month' }).click();
  await expect(sheet.getByLabel('Start date')).toHaveValue('2026-09-01');
  await expect(sheet.getByLabel('End date')).toHaveValue('2026-09-30');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByRole('radio', { name: 'Week' })).toBeChecked();
  expect(asked(log, '/sales').at(-1)).toContain(
    'dateFrom=2026-09-01&dateTo=2026-09-30&bucket=week',
  );
});

test('picked dates: a date makes it picked, the split goes by length, and bad dates are refused', async ({
  page,
}) => {
  const log = await open(page, '/sales');
  const sheet = await openPeriod(page, /This month/);
  const done = sheet.getByRole('button', { name: 'Done' });
  await expect(sheet.getByText('Up to 5 years')).toBeVisible();
  await sheet.getByLabel('Start date').fill('2020-01-01');
  await expect(sheet.getByRole('radio', { name: 'Pick dates' })).toBeChecked();
  await expect(done).toBeDisabled();
  await expect(sheet.getByText('Up to 5 years')).toBeVisible();
  await expectAccessible(page);
  await sheet.getByLabel('Start date').fill('2026-11-05');
  await expect(sheet.getByText('The end date is before the start')).toBeVisible();
  await expect(done).toBeDisabled();
  await sheet.getByLabel('Start date').fill('2025-01-01');
  await done.click();
  await expect(main(page).getByRole('button', { name: /1 Jan 2025 – 31 Oct 2026/ })).toBeVisible();
  await expect(main(page).getByRole('radio', { name: 'Month' })).toBeChecked();
  expect(asked(log, '/sales').at(-1)).toContain(
    'dateFrom=2025-01-01&dateTo=2026-10-31&bucket=month',
  );
});

test('a chart with many bars scrolls, opens on the newest, and a repeated month says its year', async ({
  page,
}) => {
  await open(page, '/sales?period=custom&from=2023-11-01&to=2026-10-31&bucket=month', {
    sales: { many: true },
  });
  const chart = main(page).getByRole('group', { name: 'Revenue by month' });
  await expect(main(page)).toContainText('Oct 2026 · 195 orders');
  await expect(main(page)).toContainText('Nov 2023 · 90 orders');
  await expect.poll(() => chart.evaluate((each) => each.scrollWidth > each.clientWidth)).toBe(true);
  await expect
    .poll(() =>
      chart.evaluate((each) => each.scrollLeft + each.clientWidth >= each.scrollWidth - 1),
    )
    .toBe(true);
  await expectAccessible(page);
});

test('profit shows only to staff who may see costs; no tax means no tax line', async ({ page }) => {
  await open(page, '/sales', { isOwner: false, permissions: ['orders:read'] });
  await expect(main(page)).toContainText('Profit shows only to staff who may see costs.');
  await expect(main(page)).not.toContainText('৳137,720');
  await expect(main(page)).not.toContainText('Cost of goods sold');
  await expectAccessible(page);

  await open(page, '/sales', {
    isOwner: false,
    permissions: ['orders:read', 'inventory:manage'],
    sales: { unknownCost: 0 },
  });
  await expect(main(page)).toContainText('৳137,720');
  await expect(main(page)).not.toContainText('had no cost recorded');
  await expect(main(page)).toContainText("Delivery charges aren't in profit");
});

test('one sale with no cost says so in the singular', async ({ page }) => {
  await open(page, '/sales', { sales: { unknownCost: 1 } });
  await expect(main(page)).toContainText('1 sale had no cost recorded; it adds nothing');
});

test('best sellers by units or revenue, a combo as itself; See all lists more; a row opens its trend', async ({
  page,
}) => {
  const log = await open(page, '/sales');
  const row = (name: RegExp) => main(page).getByRole('link', { name });
  await expect(row(/^1 Cotton T-shirt/)).toContainText('86 pcs · 69 orders');
  await expect(row(/^2 Eid combo/)).toContainText('Combo');
  expect(asked(log, '/sales/best-sellers')[0]).toContain('by=units');
  expect(asked(log, '/sales/best-sellers')[0]).toContain('limit=5');
  await expect(main(page).getByRole('link', { name: /Silk saree/ })).toHaveCount(0);

  await main(page).getByRole('radio', { name: 'By revenue' }).click();
  await expect(row(/^1 Eid combo/)).toBeVisible();
  await expect(page).toHaveURL(/by=revenue/);

  await main(page).getByRole('button', { name: 'See all' }).click();
  const all = page.getByRole('dialog', { name: 'Best sellers' });
  await expect(all.getByRole('link', { name: /Silk saree/ })).toBeVisible();
  expect(asked(log, '/sales/best-sellers').at(-1)).toContain('limit=50');
  await expectAccessible(page);
  await all.getByRole('link', { name: /Silk saree/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/sales/p-3`));
  await expect(main(page)).toContainText('Silk saree · month by month');
});

test('a product since deleted for good stays in the list, and opens nothing', async ({ page }) => {
  await open(page, '/sales', { sales: { deleted: true } });
  await main(page).getByRole('button', { name: 'See all' }).click();
  const all = page.getByRole('dialog', { name: 'Best sellers' });
  await expect(all).toContainText('Old scarf');
  await expect(all.getByRole('link', { name: /Old scarf/ })).toHaveCount(0);
});

test('a product’s trend: twelve months by month, this month’s units beside last month’s', async ({
  page,
}) => {
  const log = await open(page, '/sales/p-1?name=Cotton%20T-shirt');
  await expect(main(page)).toContainText('Cotton T-shirt · month by month');
  await expect(main(page)).toContainText('86');
  await expect(main(page)).toContainText('৳38,700');
  await expect(main(page)).toContainText('Oct · 86 orders');
  await expect(main(page)).toContainText('Nov · 30 orders');
  expect(asked(log, '/sales')[0]).toContain(
    'dateFrom=2025-11-01&dateTo=2026-10-31&bucket=month&productId=p-1',
  );
  await expectAccessible(page);
});

test('not sold in twelve months says so', async ({ page }) => {
  await open(page, '/sales/p-1?name=Cotton%20T-shirt', { sales: { trendNone: true } });
  await expect(main(page)).toContainText('Not sold in the last 12 months.');
});

test('never delivered says when sales appear; a quiet period says it was the period', async ({
  page,
}) => {
  const log = await open(page, '/sales', { sales: { empty: 'never' } });
  await expect(main(page)).toContainText('Sales appear here after the first delivery.');
  await expect(main(page).getByRole('button', { name: /This month/ })).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'Best sellers' })).toHaveCount(0);
  expect(asked(log, '/sales/best-sellers')).toEqual([]);

  await open(page, '/sales?period=lastMonth', { sales: { empty: 'period' } });
  await expect(main(page)).toContainText('No delivered orders in this period.');
  await expect(main(page)).not.toContainText('after the first delivery');
});

test('Sales is a tab of the Orders hub for whoever may read orders', async ({ page }) => {
  await open(page, '/orders');
  await page.getByRole('link', { name: 'Sales', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/sales`));

  await open(page, '/customers', { isOwner: false, permissions: ['customers:read'] });
  await expect(page.getByRole('link', { name: 'Sales', exact: true })).toHaveCount(0);
});

test('Stock value opens with this month’s profit and a way to Sales', async ({ page }) => {
  const log = await open(page, '/stock/value');
  await expect(main(page)).toContainText("This month's profit");
  await expect(main(page)).toContainText('৳137,720');
  await expect(main(page)).toContainText('Revenue less tax ৳336,120 · Cost of goods sold ৳198,400');
  await expect(main(page)).toContainText('Profit comes from delivered orders.');
  await expectAccessible(page);
  expect(asked(log, '/sales')[0]).toContain('dateFrom=2026-10-01&dateTo=2026-10-31');
  await main(page).getByRole('link', { name: 'See sales' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/sales`));
});

test('someone who may see costs but not orders gets no profit card, and asks for nothing', async ({
  page,
}) => {
  const log = await open(page, '/stock/value', {
    isOwner: false,
    permissions: ['inventory:read', 'inventory:manage'],
  });
  await expect(main(page)).toContainText('৳84,350');
  await expect(main(page)).not.toContainText("This month's profit");
  expect(asked(log, '/sales')).toEqual([]);
});
