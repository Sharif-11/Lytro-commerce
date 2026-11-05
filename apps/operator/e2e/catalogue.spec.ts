import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §11: shop types, the attribute library and option sets.

async function open(page: Page, path: string, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto(path);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function row(page: Page, words: string) {
  return main(page).locator('section > div').filter({ hasText: words }).first();
}

const TYPES = '/catalogue/shop-types';
const ATTRIBUTES = '/catalogue/attributes';
const SETS = '/catalogue/option-sets';

test.describe('shop types', () => {
  test('lists each with what a new product starts with', async ({ page }) => {
    await open(page, TYPES);
    const phones = row(page, 'Mobiles and gadgets');
    await expect(phones).toContainText('মোবাইল ও গ্যাজেট');
    await expect(phones).toContainText('mobiles_gadgets');
    await expect(phones).toContainText('piece');
    await expect(phones).toContainText('Tracked');
    await expect(phones).toContainText('IMEI');
    await expect(phones).toContainText('6 categories · 4 attributes');
    await expect(phones).toContainText('4 fields');
    await expect(row(page, 'Food and bakery')).toContainText('Not tracked');
    await expect(row(page, 'Grocery').getByRole('img', { name: 'On' })).toBeVisible();
  });

  test('editing says it is for new products, and sends every default', async ({ page }) => {
    const log = await open(page, TYPES);
    await row(page, 'Mobiles and gadgets').getByRole('button', { name: 'Edit' }).click();
    const panel = page.getByRole('dialog', { name: 'Edit Mobiles and gadgets' });
    await expect(panel.getByText('Existing products do not change.')).toBeVisible();
    await panel.getByLabel('Stock unit').selectOption('box');
    await panel.getByRole('combobox', { name: 'Stock tracking' }).selectOption('not_tracked');
    await panel.getByRole('textbox', { name: 'Low-stock threshold' }).fill('3');
    await panel.getByRole('checkbox', { name: 'Weight (kg)' }).check();
    await panel.getByRole('checkbox', { name: 'Condition' }).uncheck();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Mobiles and gadgets saved.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/presets/mobiles_gadgets')).toEqual({
      labelEn: 'Mobiles and gadgets',
      labelBn: 'মোবাইল ও গ্যাজেট',
      defaultStockUnit: 'box',
      defaultNotTracked: true,
      defaultBatch: false,
      defaultSerial: true,
      defaultSerialFormat: 'imei',
      defaultLowStock: 3,
      suggestedCategories: [
        'Phones',
        'Chargers',
        'Earbuds',
        'Cases',
        'Power banks',
        'Smart watches',
      ],
      suggestedAttributeIds: ['a4', 'a5', 'a1', 'a7'],
      upFrontFields: ['serialTracked', 'paymentPolicy', 'lowStockThreshold', 'weightKg'],
    });
    await expect(row(page, 'Mobiles and gadgets')).toContainText('Not tracked');
  });

  test('batches and serial numbers can never both be on', async ({ page }) => {
    await open(page, TYPES);
    await row(page, 'Mobiles and gadgets').getByRole('button', { name: 'Edit' }).click();
    const panel = page.getByRole('dialog', { name: 'Edit Mobiles and gadgets' });
    const batches = panel.getByRole('switch', { name: 'Batches and expiry by default' });
    const serials = panel.getByRole('switch', { name: 'Serial numbers by default' });
    await expect(serials).toHaveAttribute('aria-checked', 'true');
    await batches.click();
    await expect(batches).toHaveAttribute('aria-checked', 'true');
    await expect(serials).toHaveAttribute('aria-checked', 'false');
    await serials.click();
    await expect(batches).toHaveAttribute('aria-checked', 'false');
  });

  test('suggested categories come off and go on, and Enter does not save', async ({ page }) => {
    const log = await open(page, TYPES);
    await row(page, 'Electronics').getByRole('button', { name: 'Edit' }).click();
    const panel = page.getByRole('dialog', { name: 'Edit Electronics' });
    await panel.getByRole('button', { name: 'Remove Cables' }).click();
    await expect(panel.getByRole('button', { name: 'Remove Cables' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Add a category' }).click();
    await panel.getByRole('textbox', { name: 'Add a category' }).fill('Irons');
    await panel.getByRole('textbox', { name: 'Add a category' }).press('Enter');
    await expect(panel.getByRole('button', { name: 'Remove Irons' })).toBeVisible();
    await expect(panel).toBeVisible();
    expect(log.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Electronics saved.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/presets/electronics')).toMatchObject({
      suggestedCategories: ['Fans', 'Lights', 'Kitchen', 'Audio', 'Irons'],
    });
  });

  test('suggested attributes come from the library, by name', async ({ page }) => {
    const log = await open(page, TYPES);
    await row(page, 'Electronics').getByRole('button', { name: 'Edit' }).click();
    const panel = page.getByRole('dialog', { name: 'Edit Electronics' });
    await expect(panel.getByRole('button', { name: 'Remove Brand' })).toBeVisible();
    await panel.getByRole('button', { name: 'Remove Warranty' }).click();
    const add = panel.getByRole('combobox', { name: 'Add an attribute' });
    await expect(add.getByRole('option', { name: 'Pattern' })).toHaveCount(0);
    await expect(add.getByRole('option', { name: 'Brand' })).toHaveCount(0);
    await add.selectOption({ label: 'Colour' });
    await expect(panel.getByRole('button', { name: 'Remove Colour' })).toBeVisible();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Electronics saved.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/presets/electronics')).toMatchObject({
      suggestedAttributeIds: ['a4', 'a1'],
    });
  });

  test('a failed read can be tried again', async ({ page }) => {
    const log = await open(page, TYPES, { failing: { '/operator/presets': 503 } });
    await expect(main(page).getByText('The server did not answer')).toBeVisible();
    delete log.state.failing['/operator/presets'];
    await main(page).getByRole('button', { name: 'Try again' }).click();
    await expect(row(page, 'Clothing')).toBeVisible();
  });

  test('reads in Bangla and passes the accessibility check', async ({ page }) => {
    await open(page, TYPES, { language: 'bn' });
    await expect(row(page, 'পোশাক')).toContainText('পিস');
    await expect(row(page, 'পোশাক')).toContainText('8 ক্যাটাগরি');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await row(page, 'পোশাক').getByRole('button', { name: 'এডিট' }).click();
    const inPanel = await new AxeBuilder({ page }).analyze();
    expect(inPanel.violations).toEqual([]);
  });
});

test.describe('the attribute library', () => {
  test('lists each with its type, unit and values', async ({ page }) => {
    await open(page, ATTRIBUTES);
    const colour = row(page, 'Colour');
    await expect(colour).toContainText('Option');
    await expect(colour).toContainText('+2');
    await expect(row(page, 'Weight')).toContainText('Number');
    await expect(row(page, 'Weight')).toContainText('Weight');
    await expect(row(page, 'Pattern')).toContainText('Several options');
    await expect(row(page, 'Pattern')).toContainText('retired');
  });

  test('a new one says its type is for good, and only a number has a unit', async ({ page }) => {
    const log = await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'New attribute' }).click();
    const panel = page.getByRole('dialog', { name: 'New platform attribute' });
    await expect(panel.getByText('Its type never changes afterwards')).toBeVisible();
    await expect(panel.getByLabel('Unit kind, for numbers')).toBeDisabled();
    await panel.getByLabel('Name', { exact: true }).fill('Fabric');
    await panel.getByRole('button', { name: 'Create attribute' }).click();
    await expect(page.getByText('Fabric added. Every shop sees it from now.')).toBeVisible();
    expect(log.sent('POST', '/operator/attributes')).toEqual({
      name: 'Fabric',
      dataType: 'enum_single',
    });

    await main(page).getByRole('button', { name: 'New attribute' }).click();
    const second = page.getByRole('dialog', { name: 'New platform attribute' });
    await second.getByLabel('Name', { exact: true }).fill('Volume');
    await second.getByLabel('Data type').selectOption('number_with_unit');
    await second.getByLabel('Unit kind, for numbers').selectOption('volume');
    await second.getByRole('button', { name: 'Create attribute' }).click();
    await expect(page.getByText('Volume added.')).toBeVisible();
    expect(log.sent('POST', '/operator/attributes')).toEqual({
      name: 'Volume',
      dataType: 'number_with_unit',
      unitKind: 'volume',
    });
  });

  test('its panel shows the values with their swatches and retired ones', async ({ page }) => {
    await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Colour' }).click();
    const panel = page.getByRole('dialog', { name: 'Colour' });
    await expect(panel.getByText('Platform values')).toBeVisible();
    await expect(panel.getByText('Sky blue')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Bring back: Gold' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Retire: Red' })).toBeVisible();
  });

  test('an attribute with no options has no values to list', async ({ page }) => {
    await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Brand' }).click();
    const panel = page.getByRole('dialog', { name: 'Brand' });
    await expect(panel.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(panel.getByText('Platform values')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Add a value' })).toHaveCount(0);
  });

  test('renaming goes back to the attribute', async ({ page }) => {
    const log = await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Brand' }).click();
    await page
      .getByRole('dialog', { name: 'Brand' })
      .getByRole('button', { name: 'Rename' })
      .click();
    const panel = page.getByRole('dialog', { name: 'Rename this attribute' });
    await panel.getByLabel('Name').fill('Maker');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Renamed to Maker.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/attributes/a4')).toEqual({ name: 'Maker' });
    await expect(page.getByRole('dialog', { name: 'Maker' })).toBeVisible();
  });

  test('retiring asks first, and bringing back does not', async ({ page }) => {
    const log = await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Brand' }).click();
    await page
      .getByRole('dialog', { name: 'Brand' })
      .getByRole('button', { name: 'Retire' })
      .click();
    const panel = page.getByRole('dialog', { name: 'Retire Brand?' });
    await expect(panel.getByText('stay on products that use them')).toBeVisible();
    await panel.getByRole('button', { name: 'Retire' }).click();
    await expect(page.getByText('Brand retired.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/attributes/a4')).toEqual({ retired: true });
    const back = page.getByRole('dialog', { name: 'Brand' });
    await back.getByRole('button', { name: 'Bring back' }).click();
    await expect(page.getByText('Brand is offered again.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/attributes/a4')).toEqual({ retired: false });
  });

  test('adds a value with a swatch, and one without', async ({ page }) => {
    const log = await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Colour' }).click();
    await page
      .getByRole('dialog', { name: 'Colour' })
      .getByRole('button', { name: 'Add a value' })
      .click();
    const panel = page.getByRole('dialog', { name: 'Add a value' });
    await panel.getByLabel('Value', { exact: true }).fill('Teal');
    await panel.getByLabel('Swatch colour, optional').fill('#17a89e');
    await panel.getByRole('button', { name: 'Add a value' }).click();
    await expect(page.getByText('Teal added.')).toBeVisible();
    expect(log.sent('POST', '/operator/attributes/a1/options')).toEqual({
      value: 'Teal',
      swatchColor: '#17a89e',
    });
    const back = page.getByRole('dialog', { name: 'Colour' });
    await expect(back.getByText('Teal')).toBeVisible();
    await back.getByRole('button', { name: 'Add a value' }).click();
    const again = page.getByRole('dialog', { name: 'Add a value' });
    await again.getByLabel('Value', { exact: true }).fill('Plain');
    await again.getByRole('button', { name: 'Add a value' }).click();
    await expect(page.getByText('Plain added.')).toBeVisible();
    expect(log.sent('POST', '/operator/attributes/a1/options')).toEqual({ value: 'Plain' });
  });

  test('a value can be renamed, re-coloured and have its colour cleared', async ({ page }) => {
    const log = await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Colour' }).click();
    await page
      .getByRole('dialog', { name: 'Colour' })
      .getByRole('button', { name: 'Rename: Red' })
      .click();
    const panel = page.getByRole('dialog', { name: 'Rename this value' });
    await expect(panel.getByLabel('Swatch colour, optional')).toHaveValue('#c8323b');
    await panel.getByLabel('Value', { exact: true }).fill('Crimson');
    await panel.getByLabel('Swatch colour, optional').fill('');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Crimson saved.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/attributes/a1/options/c3')).toEqual({
      value: 'Crimson',
      swatchColor: null,
    });
  });

  test('a value retires after asking, and comes back without', async ({ page }) => {
    const log = await open(page, ATTRIBUTES);
    await main(page).getByRole('button', { name: 'Open: Colour' }).click();
    await page
      .getByRole('dialog', { name: 'Colour' })
      .getByRole('button', { name: 'Retire: Red' })
      .click();
    const panel = page.getByRole('dialog', { name: 'Retire Red?' });
    await panel.getByRole('button', { name: 'Retire' }).click();
    await expect(page.getByText('Red retired.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/attributes/a1/options/c3')).toEqual({ retired: true });
    await page
      .getByRole('dialog', { name: 'Colour' })
      .getByRole('button', { name: 'Bring back: Gold' })
      .click();
    await expect(page.getByText('Gold is offered again.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/attributes/a1/options/c8')).toEqual({ retired: false });
  });

  test('a failed read can be tried again', async ({ page }) => {
    const log = await open(page, ATTRIBUTES, { failing: { '/operator/attributes': 503 } });
    await expect(main(page).getByText('The server did not answer')).toBeVisible();
    delete log.state.failing['/operator/attributes'];
    await main(page).getByRole('button', { name: 'Try again' }).click();
    await expect(row(page, 'Colour')).toBeVisible();
  });

  test('reads in Bangla and passes the accessibility check', async ({ page }) => {
    await open(page, ATTRIBUTES, { language: 'bn' });
    await expect(main(page).getByRole('heading', { name: 'অ্যাট্রিবিউট লাইব্রেরি' })).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await main(page).getByRole('button', { name: 'খুলুন: Colour' }).click();
    const inPanel = await new AxeBuilder({ page }).analyze();
    expect(inPanel.violations).toEqual([]);
  });
});

test.describe('option sets', () => {
  test('lists each with its values and who is offered it first', async ({ page }) => {
    await open(page, SETS);
    await expect(row(page, 'Clothing sizes')).toContainText('XXL');
    await expect(row(page, 'Clothing sizes')).toContainText('Clothing');
    await expect(row(page, 'Basic colours')).toContainText('every shop');
  });

  test('a new set takes its values one to a line', async ({ page }) => {
    const log = await open(page, SETS);
    await main(page).getByRole('button', { name: 'New option set' }).click();
    const panel = page.getByRole('dialog', { name: 'New option set' });
    await expect(panel.getByRole('button', { name: 'Create set' })).toBeDisabled();
    await panel.getByLabel('Name').fill('Bottle sizes');
    await panel.getByLabel('Values, one per line').fill('250 ml\n\n 500 ml \n1 litre\n');
    await panel.getByLabel('Offer first to shops of type').selectOption('grocery');
    await panel.getByRole('button', { name: 'Create set' }).click();
    await expect(page.getByText('Bottle sizes created.')).toBeVisible();
    expect(log.sent('POST', '/operator/option-sets')).toEqual({
      name: 'Bottle sizes',
      options: ['250 ml', '500 ml', '1 litre'],
      presetKey: 'grocery',
    });
    await expect(row(page, 'Bottle sizes')).toContainText('Grocery');
  });

  test('editing says what stays, and every shop goes as nothing', async ({ page }) => {
    const log = await open(page, SETS);
    await row(page, 'Clothing sizes').getByRole('button', { name: 'Edit' }).click();
    const panel = page.getByRole('dialog', { name: 'Edit set' });
    await expect(panel.getByText('editing changes only what is offered next')).toBeVisible();
    await expect(panel.getByLabel('Values, one per line')).toHaveValue('XS\nS\nM\nL\nXL\nXXL');
    await expect(panel.getByLabel('Offer first to shops of type')).toHaveValue('clothing');
    await panel.getByLabel('Offer first to shops of type').selectOption('');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Clothing sizes saved.')).toBeVisible();
    expect(log.sent('PATCH', '/operator/option-sets/o1')).toMatchObject({ presetKey: null });
    await expect(row(page, 'Clothing sizes')).toContainText('every shop');
  });

  test('deleting asks first and says what stays', async ({ page }) => {
    const log = await open(page, SETS);
    await row(page, 'Basic colours').getByRole('button', { name: 'Delete' }).click();
    const panel = page.getByRole('dialog', { name: 'Delete this set?' });
    await expect(
      panel.getByText('Values shops already inserted from it stay with them.'),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Basic colours deleted.')).toBeVisible();
    expect(
      log.calls.some(
        (call) => call.method === 'DELETE' && call.path === '/operator/option-sets/o4',
      ),
    ).toBe(true);
    await expect(main(page).getByText('Basic colours')).toHaveCount(0);
  });

  test('a name already taken is said, and a failed read can be tried again', async ({ page }) => {
    const log = await open(page, SETS, { failing: { '/operator/option-sets': 503 } });
    await expect(main(page).getByText('The server did not answer')).toBeVisible();
    delete log.state.failing['/operator/option-sets'];
    await main(page).getByRole('button', { name: 'Try again' }).click();
    log.state.refuseWrite = {
      path: '/operator/option-sets',
      status: 409,
      code: 'conflict',
      message: 'A set already has this name.',
    };
    await main(page).getByRole('button', { name: 'New option set' }).click();
    const panel = page.getByRole('dialog', { name: 'New option set' });
    await panel.getByLabel('Name').fill('Clothing sizes');
    await panel.getByLabel('Values, one per line').fill('S');
    await panel.getByRole('button', { name: 'Create set' }).click();
    await expect(panel.getByText('A set already has this name.')).toBeVisible();
  });

  test('reads in Bangla and passes the accessibility check', async ({ page }) => {
    await open(page, SETS, { language: 'bn' });
    await expect(row(page, 'Basic colours')).toContainText('সব শপ');
    await expect(row(page, 'Clothing sizes')).toContainText('পোশাক');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await row(page, 'Clothing sizes').getByRole('button', { name: 'এডিট' }).click();
    const inPanel = await new AxeBuilder({ page }).analyze();
    expect(inPanel.violations).toEqual([]);
  });
});
