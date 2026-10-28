import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { attributeShop } from './support/attributes';

// TENANT-DASHBOARD-DESIGN §7.6, Slice 11.8 (Part 19): Attributes -- the library's and the shop's own, searched, the
// retired ones last with Bring back; New attribute; the shop's own sheet (rename, options added, edited, retired and
// brought back, the attribute retired); a library attribute's sheet; Option sets with New set and delete; and someone
// who may only look. Each test runs on a phone and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}, path = '/attributes'): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: attributeShop(), ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(main(page).getByRole('link', { name: /^Option sets/ })).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog');
}

/** An attribute's row on the page, by its name. */
function row(page: Page, name: string) {
  return main(page).getByRole('button', { name: new RegExp(`^${name} (Library|Yours)`) });
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

test('lists the library’s attributes and the shop’s own, searched, the retired last', async ({
  page,
}) => {
  const log = await open(page);
  expect(
    log.calls.some(
      (call) => call.path === '/attributes' && call.query.includes('includeRetired=true'),
    ),
  ).toBe(true);
  await expect(main(page).getByRole('link', { name: /^Attributes\s*12$/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^Option sets/ })).toContainText('2');
  await expect(row(page, 'Size')).toContainText('Options · 5 options');
  await expect(row(page, 'Colour')).toContainText('Library');
  await expect(row(page, 'Thread count')).toContainText('Yours');
  await expect(row(page, 'Thread count')).toContainText('Number (count)');
  await expect(row(page, 'Net weight')).toContainText('Number (kg)');
  // Its retired option is not counted.
  await expect(row(page, 'Cotton type')).toContainText('Options · 3 options');
  await expect(main(page).getByText('Retired', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Bring back Old fit' })).toBeVisible();
  await expect(row(page, 'Old fit')).toHaveCount(0);
  await expectAccessible(page);

  await main(page).getByLabel('Search attributes').fill('fit');
  await expect(row(page, 'Fit')).toBeVisible();
  await expect(row(page, 'Size')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Bring back Old fit' })).toBeVisible();
  await main(page).getByLabel('Search attributes').fill('zzz');
  await expect(main(page).getByText('Nothing by that name.')).toBeVisible();
});

test('brings a retired attribute back', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Bring back Old fit' }).click();
  await expect(row(page, 'Old fit')).toBeVisible();
  expect(log.sent('PATCH', '/attributes/a-own-3')).toEqual({ retired: false });
  await expect(main(page).getByText('Retired', { exact: true })).toHaveCount(0);
});

test('makes a new attribute as the product editor does', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New attribute' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'New attribute' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Create' })).toBeDisabled();
  await sheet(page).getByLabel('Name', { exact: true }).fill('Size');
  await sheet(page).getByRole('button', { name: 'Create' }).click();
  await expect(sheet(page).getByText('The shop already has that attribute.')).toBeVisible();
  await sheet(page).getByLabel('Name', { exact: true }).fill('Neckline');
  await sheet(page).getByRole('button', { name: 'Several options' }).click();
  await expect(sheet(page).getByText(/Several can be picked at once/)).toBeVisible();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Create' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(log.sent('POST', '/attributes')).toEqual({ name: 'Neckline', dataType: 'enum_multi' });
  await expect(row(page, 'Neckline')).toContainText('Several options');
});

test('the shop’s own attribute: renamed, its options added, edited, retired and brought back', async ({
  page,
}) => {
  const log = await open(page);
  await row(page, 'Cotton type').click();
  await expect(sheet(page).getByRole('heading', { name: 'Cotton type' })).toBeVisible();
  await expect(sheet(page).getByLabel('Type')).toHaveValue('Options');
  await expect(sheet(page).getByText('The type cannot change later.')).toBeVisible();

  // An option added from the sheet.
  await sheet(page).getByRole('button', { name: 'Add option' }).click();
  await sheet(page).getByLabel('Add option').fill('Khadi');
  await sheet(page).getByRole('button', { name: 'Insert' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Edit Khadi' })).toBeVisible();
  expect(log.sent('POST', '/attributes/a-own-2/options/batch')).toEqual({ values: ['Khadi'] });

  // A retired option comes back.
  await sheet(page).getByRole('button', { name: 'Bring back Silk blend' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Edit Silk blend' })).toBeVisible();
  expect(log.sent('PATCH', '/attributes/a-own-2/options/o-c-4')).toEqual({ retired: false });

  // One option's step: renamed and given a swatch, saved together.
  await sheet(page).getByRole('button', { name: 'Edit Linen' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Linen' })).toBeVisible();
  await sheet(page).getByLabel('Option name').fill('Pure linen');
  await sheet(page).getByRole('button', { name: '#1B7A43' }).click();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Edit Pure linen' })).toBeVisible();
  expect(log.sent('PATCH', '/attributes/a-own-2/options/o-c-3')).toEqual({
    value: 'Pure linen',
    swatchColor: '#1B7A43',
  });

  // Another retired from its step.
  await sheet(page).getByRole('button', { name: 'Edit Cotton blend' }).click();
  await sheet(page).getByRole('button', { name: 'Retire this option' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Bring back Cotton blend' })).toBeVisible();
  expect(log.sent('PATCH', '/attributes/a-own-2/options/o-c-2')).toEqual({ retired: true });

  // Renamed and saved.
  await sheet(page).getByLabel('Name', { exact: true }).fill('Cotton kind');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(log.sent('PATCH', '/attributes/a-own-2')).toEqual({ name: 'Cotton kind' });

  // Retired, it moves to the retired ones.
  await row(page, 'Cotton kind').click();
  await sheet(page).getByRole('button', { name: 'Retire' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(log.sent('PATCH', '/attributes/a-own-2')).toEqual({ retired: true });
  await expect(main(page).getByRole('button', { name: 'Bring back Cotton kind' })).toBeVisible();
});

test('a library attribute keeps its name and options; the shop’s own values sit beside them', async ({
  page,
}) => {
  await open(page);
  await row(page, 'Colour').click();
  await expect(sheet(page).getByLabel('Name', { exact: true })).toHaveAttribute('readonly', '');
  await expect(sheet(page).getByText('A library attribute’s name cannot change.')).toBeVisible();
  await expect(sheet(page).getByText('Black Library')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Edit Black' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Edit Maroon' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Retire' })).toHaveCount(0);
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page)).toHaveCount(0);
});

test('option sets: the library’s and the shop’s own, deleted or made', async ({ page }) => {
  const log = await open(page, {}, '/attributes/option-sets');
  await expect(
    page.getByRole('heading', { name: 'Option sets', exact: true }).first(),
  ).toBeVisible();
  await expect(main(page).getByText('S · M · L · XL · XXL')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Delete S–XXL' })).toHaveCount(0);
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Delete Kids sizes' }).click();
  await expect(main(page).getByText('Kids sizes')).toHaveCount(0);
  expect(
    log.calls.some((call) => call.method === 'DELETE' && call.path === '/option-sets/set-own'),
  ).toBe(true);

  await main(page).getByRole('button', { name: 'New set' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'New set' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByText('A name is needed')).toBeVisible();
  await expect(sheet(page).getByText('Give it at least one option')).toBeVisible();
  await sheet(page).getByLabel('Set name').fill('Shoe sizes');
  for (const value of ['39', '40', '41']) {
    await sheet(page).getByLabel('Add option').fill(value);
    await sheet(page).getByLabel('Add option').press('Enter');
  }
  await sheet(page).getByRole('button', { name: 'Remove 40' }).click();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(log.sent('POST', '/option-sets')).toEqual({ name: 'Shoe sizes', options: ['39', '41'] });
  await expect(main(page).getByText('39 · 41')).toBeVisible();
});

test('someone who may only look opens a sheet without changing anything', async ({ page }) => {
  await open(page, { isOwner: false, permissions: ['products:read'] });
  await expect(main(page).getByRole('button', { name: 'New attribute' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Bring back/ })).toHaveCount(0);
  await row(page, 'Cotton type').click();
  await expect(sheet(page).getByLabel('Name', { exact: true })).toHaveAttribute('readonly', '');
  await expect(sheet(page).getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Save' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Add option' })).toHaveCount(0);
});
