import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.33, Slice 4.8c's first part (the prototype's Part 31; TAX-01, MNU-01): Settings > Tax, the
// tax class under a product's More settings, and a product's add-on groups. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

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

/** Opens a product's More settings. */
async function openMore(page: Page): Promise<void> {
  await main(page).getByText('More settings').click();
}

test('Settings shows Tax with what it holds; the page lists the classes and marks the default', async ({
  page,
}) => {
  await open(page, '/settings');
  const row = main(page).getByRole('link', { name: /^Tax/ });
  await expect(row).toContainText('VAT 5% default · 3 classes');
  await row.click();
  await expect(page).toHaveURL(`/${SLUG}/settings/tax`);
  await expect(main(page)).toContainText('A class says how much of a price is tax');
  await expect(main(page).getByRole('button', { name: /^VAT 5%/ })).toContainText('Default');
  await expect(main(page).getByRole('button', { name: /^VAT 15%/ })).toContainText('15%');
  await expectAccessible(page);
});

test('New products start with: the default is changed, or set to no tax', async ({ page }) => {
  const log = await open(page, '/settings/tax');
  const picker = main(page).getByLabel('New products start with');
  await expect(picker).toHaveValue('tx-5');
  await picker.selectOption('tx-15');
  await expect(main(page).getByRole('button', { name: /^VAT 15%/ })).toContainText('Default');
  await picker.selectOption('');
  await expect(main(page).getByRole('button', { name: /^VAT 15%/ })).not.toContainText('Default');
  expect(sent(log, 'PUT', '/tax-classes/default')).toEqual([
    { taxClassId: 'tx-15' },
    { taxClassId: null },
  ]);
});

test('a new class: its name and rate, 0 to 100, and made the default', async ({ page }) => {
  const log = await open(page, '/settings/tax');
  await main(page).getByRole('button', { name: 'Add a class' }).click();
  const adding = sheet(page, 'New tax class');
  const save = adding.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await adding.getByLabel('Name').fill('VAT 7.5%');
  await adding.getByLabel('Rate').fill('150');
  await expect(save).toBeDisabled();
  await adding.getByLabel('Rate').fill('7.5');
  await adding.getByRole('switch', { name: 'Make it the default for new products' }).click();
  await expectAccessible(page);
  await save.click();
  await expect(page.getByText('VAT 7.5% saved')).toBeVisible();
  expect(sent(log, 'POST', '/tax-classes')).toEqual([{ name: 'VAT 7.5%', rate: 7.5 }]);
  expect(sent(log, 'PUT', '/tax-classes/default')).toHaveLength(1);
  await expect(main(page).getByRole('button', { name: /^VAT 7.5%/ })).toContainText('Default');
});

test('a class is changed; one in use is refused deleting, one free goes', async ({ page }) => {
  const products = drawnProducts();
  const first = products.products[0];
  if (first) first.taxClassId = 'tx-15';
  const log = await open(page, '/settings/tax', { products });

  await main(page)
    .getByRole('button', { name: /^VAT 15%/ })
    .click();
  const editing = sheet(page, 'VAT 15%');
  await expect(editing).toContainText('past orders keep theirs');
  await editing.getByLabel('Rate').fill('16');
  await editing.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('VAT 15% saved')).toBeVisible();
  expect(sent(log, 'PATCH', '/tax-classes/tx-15')).toEqual([{ rate: 16 }]);

  await main(page)
    .getByRole('button', { name: /^VAT 15%/ })
    .click();
  await sheet(page, 'VAT 15%').getByRole('button', { name: 'Delete' }).click();
  const refused = page.getByRole('dialog', { name: "VAT 15% can't be deleted" });
  await expect(refused).toContainText('Move them to another class first');
  await refused.getByRole('button', { name: 'OK' }).click();

  await main(page)
    .getByRole('button', { name: /^Zero-rated/ })
    .click();
  await sheet(page, 'Zero-rated').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Zero-rated deleted')).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Zero-rated/ })).toHaveCount(0);
});

test('no classes: prices carry no tax, and one can be added', async ({ page }) => {
  const products = drawnProducts();
  products.tax = { classes: [], defaultId: null };
  await open(page, '/settings/tax', { products });
  await expect(main(page)).toContainText('No tax classes, so prices carry no tax.');
  await expect(main(page).getByRole('button', { name: 'Add a class' })).toBeVisible();
});

test('a new product starts with the default, sent only if changed; an edit sends the class', async ({
  page,
}) => {
  const log = await open(page, '/products/new');
  await main(page).getByLabel('Name', { exact: true }).fill('Linen shirt');
  await main(page).getByLabel('Price', { exact: true }).fill('900');
  await openMore(page);
  const field = main(page).getByLabel('Tax class');
  await expect(field).toHaveValue('tx-5');
  await expect(field.locator('option:checked')).toHaveText('VAT 5% · default');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => sent(log, 'POST', '/products').length).toBe(1);
  expect(sent(log, 'POST', '/products')[0]).not.toHaveProperty('taxClassId');

  const edit = await open(page, '/products/p-1');
  await openMore(page);
  await main(page).getByLabel('Tax class').selectOption('tx-15');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => sent(edit, 'PATCH', '/products/p-1').length).toBe(1);
  expect(sent(edit, 'PATCH', '/products/p-1')[0]).toEqual({ taxClassId: 'tx-15' });
});

test('add-ons: a group with a rule and options is saved with the product, read back as it was', async ({
  page,
}) => {
  const log = await open(page, '/products/p-1');
  await expect(main(page)).toContainText('Extras chosen when ordering');
  await main(page).getByRole('button', { name: 'Add a group' }).click();
  const adding = sheet(page, 'Add a group');
  const save = adding.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await adding.getByLabel('Group name').fill('Alteration');
  await adding.getByLabel('Name', { exact: true }).fill('Shorter sleeves');
  await adding.getByLabel('Adds to the price').fill('80');
  await adding.getByRole('button', { name: 'Add an option' }).click();
  await adding.getByLabel('Name', { exact: true }).nth(1).fill('Discount sleeve');
  await adding.getByLabel('Adds to the price').nth(1).fill('−20');
  await expectAccessible(page);
  await save.click();
  await expect(main(page)).toContainText('Optional, any number');
  await expect(main(page)).toContainText('Shorter sleeves +৳80 · Discount sleeve −৳20');

  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => sent(log, 'PATCH', '/products/p-1').length).toBe(1);
  expect(sent(log, 'PATCH', '/products/p-1')[0]).toEqual({
    modifierGroups: [
      {
        name: 'Alteration',
        minSelect: 0,
        maxSelect: 2,
        options: [
          { name: 'Shorter sleeves', priceChange: 80, isDefault: false },
          { name: 'Discount sleeve', priceChange: -20, isDefault: false },
        ],
      },
    ],
  });
  await page.reload();
  await expect(main(page).getByRole('button', { name: /^Alteration/ })).toContainText(
    'Optional, any number',
  );
});

test('a group’s rules: Custom shows the numbers and checks them; one to pick keeps one default', async ({
  page,
}) => {
  await open(page, '/products/p-1');
  await main(page).getByRole('button', { name: 'Add a group' }).click();
  const adding = sheet(page, 'Add a group');
  await adding.getByLabel('Group name').fill('Spice');
  await adding.getByLabel('Name', { exact: true }).fill('Mild');
  await adding.getByRole('button', { name: 'Add an option' }).click();
  await adding.getByLabel('Name', { exact: true }).nth(1).fill('Hot');

  await adding.getByRole('radio', { name: 'Custom' }).click();
  await adding.getByLabel('At least').fill('1');
  await adding.getByLabel('At most').fill('3');
  await expect(adding).toContainText('With 2 options');
  await expect(adding.getByRole('button', { name: 'Save' })).toBeDisabled();
  await adding.getByLabel('At most').fill('2');
  await expect(adding).toContainText('At least 1, at most 2');
  await expect(adding.getByRole('button', { name: 'Save' })).toBeEnabled();

  await adding.getByRole('radio', { name: 'Required, exactly 1' }).click();
  await adding.getByRole('switch', { name: 'Picked by default: Mild' }).click();
  await adding.getByRole('switch', { name: 'Picked by default: Hot' }).click();
  await expect(adding.getByRole('switch', { name: 'Picked by default: Mild' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await adding.getByRole('button', { name: 'Remove: Hot' }).click();
  await expect(adding.getByLabel('Name', { exact: true })).toHaveCount(1);
  await adding.getByRole('button', { name: 'Save' }).click();
  await expect(main(page)).toContainText('Required, exactly 1');

  await main(page)
    .getByRole('button', { name: /^Spice/ })
    .click();
  await sheet(page, 'Add-on group').getByRole('button', { name: 'Delete the group' }).click();
  await expect(main(page).getByRole('button', { name: /^Spice/ })).toHaveCount(0);
});

test('someone who may only look sees the add-ons and changes nothing', async ({ page }) => {
  const products = drawnProducts();
  const first = products.products[0];
  if (first) {
    first.modifierGroups = [
      {
        id: 'g-1',
        name: 'Gift wrap',
        minSelect: 0,
        maxSelect: 1,
        options: [{ id: 'o-1', name: 'Gift wrap', priceChange: '50.00', isDefault: false }],
      },
    ];
  }
  await open(page, '/products/p-1', {
    isOwner: false,
    permissions: ['products:read'],
    products,
  });
  await expect(main(page)).toContainText('Gift wrap +৳50');
  await expect(main(page).getByRole('button', { name: 'Add a group' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Gift wrap/ })).toBeDisabled();
});
