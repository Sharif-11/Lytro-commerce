import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { expiringShop, stockShop } from './support/stock';

// TENANT-DASHBOARD-DESIGN §7.9 and §7.22, Slice 11.9 step 5 (the prototype's `expiring`, `sh-writeoff`, `stock-value`
// and Part 20's `expiring-empty`): the batches expiring then expired with a write-off, the Stock page's figures opening
// their pages, and the stock's value with this month's losses, for someone who may see costs. Each test runs on a
// phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: expiringShop(), ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');

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

test('the batches expiring, soonest first, then those expired; Expired alone on its own segment', async ({
  page,
}) => {
  await open(page, '/stock/expiring');
  const chips = main(page).getByRole('group');
  await expect(chips.getByRole('button', { name: /^Expiring/ })).toContainText('2');
  await expect(chips.getByRole('button', { name: /^Expired/ })).toContainText('1');
  await expect(main(page).getByText(/^(FC|LB)-\d+/)).toHaveText([
    /^FC-0921 · .* · 12 pcs$/,
    /^LB-0818 · .* · 6 pcs$/,
    /^FC-0702 · .* · 3 pcs$/,
  ]);
  await expect(main(page)).toContainText('13 days left');
  await expect(main(page)).toContainText(
    'An expired batch leaves the sellable count automatically.',
  );
  await expectAccessible(page);
  await chips.getByRole('button', { name: /^Expired/ }).click();
  await expect(page).toHaveURL(/seg=expired/);
  await expect(main(page).getByText(/^(FC|LB)-\d+/)).toHaveText([/^FC-0702/]);
});

test('an expired batch is written off, the loss said at average cost, and leaves the list', async ({
  page,
}) => {
  const log = await open(page, '/stock/expiring');
  await main(page).getByRole('button', { name: 'Write off: FC-0702' }).click();
  const sheet = page.getByRole('dialog', { name: 'Write off a batch' });
  await expect(sheet).toContainText('BatchFC-0702 · exp');
  await expect(sheet).toContainText('Units left3 pcs');
  await expect(sheet).toContainText('The loss is recorded at average cost: ৳360');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Write off 3' }).click();
  await expect(sheet).toBeHidden();
  expect(log.calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
    '/products/p-fc/batches/b-1/write-off',
  ]);
  await expect(main(page).getByText(/^FC-0702/)).toHaveCount(0);
});

test('nothing expiring, or nothing expired, says so', async ({ page }) => {
  await open(page, '/stock/expiring', { products: stockShop() });
  await expect(main(page)).toContainText('No batch expires within 30 days.');
  await main(page)
    .getByRole('button', { name: /^Expired/ })
    .click();
  await expect(main(page)).toContainText('No batch has expired.');
});

test("the Stock page's figures open Stock value and Expiring", async ({ page }) => {
  // A shop that keeps batches: one that keeps none has no Expiring figure (Part 26).
  await open(page, '/stock');
  const figures = main(page).getByRole('group', { name: 'Stock figures' });
  await figures.getByRole('link', { name: /^Stock value/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/stock/value`);
  await page.goBack();
  await figures.getByRole('link', { name: /^Expiring/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/stock/expiring`);
});

test("the stock's value now, by category, and this month's losses by reason", async ({ page }) => {
  await open(page, '/stock/value', { products: stockShop() });
  await expect(main(page)).toContainText('Stock on hand৳84,350412 pcs · at average cost');
  await expect(main(page)).toContainText('Jackets৳38,500');
  await expect(main(page)).toContainText('Uncategorized৳11,500');
  await expect(main(page)).toContainText('Losses this month · ৳1,890');
  await expect(main(page)).toContainText('Damaged · 2 pcs৳1,240');
  await expect(main(page)).toContainText('Lost · 1 pcs৳650');
  await expectAccessible(page);
});

test('someone who may only look sees the batches but no write-off, and never Stock value', async ({
  page,
}) => {
  const log = await open(page, '/stock/expiring', {
    isOwner: false,
    permissions: ['inventory:read', 'products:read'],
  });
  await expect(main(page).getByText(/^FC-0702/)).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Write off/ })).toHaveCount(0);
  await page.goto(`/${SLUG}/stock/value`);
  await expect(page).toHaveURL(`/${SLUG}`);
  expect(log.calls.some((call) => call.path === '/inventory/figures')).toBe(false);
});
