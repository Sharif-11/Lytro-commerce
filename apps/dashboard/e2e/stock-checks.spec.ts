import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import type { ProductsFixture } from './support/products';
import { creamShop, galaxyShop, stockShop } from './support/stock';

// TENANT-DASHBOARD-DESIGN §7.8, Slice 11.9 step 4 (the prototype's `stock-checks`, `stock-check`, `stock-check-detail`,
// Part 20 and design v3.8): the shop's checks newest first, each with its own number; a new check picking products or
// a category, counting a batch-kept product batch by batch and naming the IMEIs a serial line is short; a note; what
// the changes come to; and a saved check's own page. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: stockShop(), ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name });
const counted = (page: Page, name: string | RegExp) =>
  main(page).getByRole('textbox', {
    name: typeof name === 'string' ? `Counted for ${name}` : name,
  });

function sent(log: ApiLog, method: string, path: string): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body as Record<string, unknown>);
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

/** The face cream with its three batches and the Galaxy with five IMEIs, alone. */
function kept(): ProductsFixture {
  return {
    ...creamShop(),
    products: [
      ...creamShop().products.filter((each) => each.id === 'p-fc'),
      ...galaxyShop().products,
    ],
  };
}

test('the checks newest first, each with what it came to; one opens with its lines, the matched ones folded', async ({
  page,
}) => {
  await open(page, '/stock/checks');
  const rows = main(page).getByRole('link', { name: /^#\d+/ });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('#12');
  await expect(rows.nth(0)).toContainText('Month-end count');
  await expect(rows.nth(0)).toContainText('Counted by Rumana · 24 lines · 2 changed');
  await expect(rows.nth(1)).toContainText('Matched');
  await expect(rows.nth(2)).toContainText('−৳820');
  await expectAccessible(page);
  await rows.nth(0).click();
  await expect(page).toHaveURL(`/${SLUG}/stock/checks/sc-12`);
  const figures = main(page).getByRole('group', { name: 'Lines' });
  await expect(figures).toContainText('Lines242 changed');
  await expect(figures).toContainText('Gained৳1,240XL +1');
  await expect(figures).toContainText('Lost৳1,240M −1');
  const table = main(page).getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(table).toContainText('Denim jacket · M54−1');
  await main(page).getByRole('button', { name: '+20 more lines, all matched' }).click();
  // Every line, and Show less folding the matched ones again.
  await expect(table.getByRole('row')).toHaveCount(26);
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Show less' }).click();
  await expect(table.getByRole('row')).toHaveCount(6);
});

test('Check stock opens the checks; a new one counts the picked products, and saving records each difference', async ({
  page,
}) => {
  const log = await open(page, '/stock');
  await page.getByRole('link', { name: 'Check stock' }).click();
  await expect(page).toHaveURL(`/${SLUG}/stock/checks`);
  await main(page).getByRole('link', { name: 'New check' }).first().click();
  await expect(page).toHaveURL(`/${SLUG}/stock/checks/new`);
  await expect(main(page)).toContainText(
    'Pick what to count: some products, or everything in a category.',
  );
  await expect(main(page).getByRole('button', { name: 'Save the count' })).toBeDisabled();
  await main(page).getByRole('button', { name: 'Pick products or a category' }).click();
  const pick = sheet(page, 'What to count');
  await pick.getByRole('checkbox', { name: /^Denim jacket/ }).check();
  await expectAccessible(page);
  await pick.getByRole('button', { name: 'Count 4 lines' }).click();
  await expect(main(page).getByRole('table').getByRole('row')).toHaveCount(5);
  await counted(page, 'Denim jacket · M').fill('4');
  await counted(page, 'Denim jacket · XL').fill('8');
  await expect(main(page)).toContainText(
    '2 changed · Lost ৳1,240, gained ৳1,240. Differences are recorded as "counted again".',
  );
  await main(page).getByLabel('Note').fill('Month-end count');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Save the count' }).click();
  await expect(page).toHaveURL(`/${SLUG}/stock/checks/sc-13`);
  await expect(main(page)).toContainText('#13');
  await expect(main(page)).toContainText('Month-end count');
  // Only the lines counted are sent; the two left blank are not counted.
  expect(sent(log, 'POST', '/stock-checks')).toEqual([
    {
      lines: [
        { variantId: 'p-2-v2', counted: 4 },
        { variantId: 'p-2-v4', counted: 8 },
      ],
      note: 'Month-end count',
    },
  ]);
});

test('a category is counted whole: every product filed there', async ({ page }) => {
  await open(page, '/stock/checks/new');
  await main(page).getByRole('button', { name: 'Pick products or a category' }).click();
  const pick = sheet(page, 'What to count');
  await pick.getByRole('radio', { name: 'A category' }).click();
  await pick.getByRole('radio', { name: /^Jackets/ }).click();
  await pick.getByRole('button', { name: 'Count 8 lines' }).click();
  await expect(main(page).getByRole('table').getByRole('row')).toHaveCount(9);
  await expect(counted(page, 'Hoodie · S')).toBeVisible();
});

test('a batch-kept product counts batch by batch, and a serial line short names the IMEI not found', async ({
  page,
}) => {
  const log = await open(page, '/stock/checks/new', { products: kept() });
  await main(page).getByRole('button', { name: 'Pick products or a category' }).click();
  const pick = sheet(page, 'What to count');
  await pick.getByRole('checkbox', { name: /^Face cream/ }).check();
  await pick.getByRole('checkbox', { name: /^Galaxy A15/ }).check();
  await pick.getByRole('button', { name: 'Count 4 lines' }).click();
  await expect(main(page).getByRole('table')).toContainText('Face cream 50 ml');
  await counted(page, /^Counted for FC-0921/).fill('11');
  await counted(page, 'Galaxy A15 · 128 GB · Black').fill('4');
  // Every unit short had an IMEI, so it must be named before the count is saved.
  const save = main(page).getByRole('button', { name: 'Save the count' });
  await expect(save).toBeDisabled();
  await main(page).getByRole('button', { name: 'Pick the IMEI not found' }).click();
  const missing = sheet(page, 'The IMEI not found');
  await expect(missing).toContainText('Galaxy A15 · 128 GB · Black · Expected 5 · Counted 4');
  await expect(missing.getByRole('button', { name: 'Done' })).toBeDisabled();
  await missing.getByRole('checkbox', { name: '357812094561259' }).check();
  await expect(missing.getByRole('checkbox', { name: '357812094561234' })).toBeDisabled();
  await expectAccessible(page);
  await missing.getByRole('button', { name: 'Done' }).click();
  await expect(main(page)).toContainText('Not found: 357812094561259');
  await save.click();
  await expect(page).toHaveURL(/\/stock\/checks\/sc-13$/);
  expect(sent(log, 'POST', '/stock-checks')).toEqual([
    {
      lines: [
        { variantId: 'p-fc-v1', batchId: 'b-2', counted: 11 },
        { variantId: 'p-ga-v1', counted: 4, missingSerials: ['357812094561259'] },
      ],
    },
  ]);
});

test('a count the unit cannot take holds the save', async ({ page }) => {
  await open(page, '/stock/checks/new');
  await main(page).getByRole('button', { name: 'Pick products or a category' }).click();
  await sheet(page, 'What to count')
    .getByRole('checkbox', { name: /^Denim jacket/ })
    .check();
  await sheet(page, 'What to count').getByRole('button', { name: 'Count 4 lines' }).click();
  await counted(page, 'Denim jacket · S').fill('2.5');
  await expect(counted(page, 'Denim jacket · S')).toHaveAttribute('aria-invalid', 'true');
  await expect(main(page).getByRole('button', { name: 'Save the count' })).toBeDisabled();
});

test('no check yet says so, with New check', async ({ page }) => {
  await open(page, '/stock/checks', { products: { ...stockShop(), checks: [] } });
  await expect(main(page)).toContainText('No stock checks yet. Each count you save is kept here.');
  await expect(main(page).getByRole('link', { name: 'New check' })).toHaveCount(2);
  await expectAccessible(page);
});

test('someone who may only look sees the checks, but no New check and no costs', async ({
  page,
}) => {
  await open(page, '/stock/checks', {
    isOwner: false,
    permissions: ['inventory:read', 'products:read'],
  });
  await expect(main(page).getByRole('link', { name: /^#12/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'New check' })).toHaveCount(0);
  await expect(main(page)).not.toContainText('৳');
  await main(page).getByRole('link', { name: /^#12/ }).click();
  await expect(main(page).getByRole('group', { name: 'Lines' })).toContainText('Lines242 changed');
  await expect(main(page)).not.toContainText('Gained');
});
