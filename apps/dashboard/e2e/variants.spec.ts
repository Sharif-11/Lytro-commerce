import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts, type ProductsFixture } from './support/products';
import { drawnLibrary, type MatrixFixture } from './support/variants';

// TENANT-DASHBOARD-DESIGN §7.4, Slice 11.7b (Part 14): options and variants -- the attribute cards, the variant table
// with what each can sell, Fill all, removing an option that holds stock, options typed or from a set with their
// swatches, Add attribute with its New attribute step and the roles a type cannot take, describing values by type, a
// new product's variants and descriptions in one request, the shared stock, the 100-variant limit, and a refused SKU.
// Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products/${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function card(page: Page) {
  return main(page).getByRole('region', { name: 'Options and variants' });
}

function sheet(page: Page, name: string | RegExp) {
  return page.getByRole('dialog', { name });
}

function save(page: Page) {
  return main(page).getByRole('button', { name: /^(Save|Fix \d+ things? to save)$/ });
}

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

/** The drawn shop with the T-shirt's variants changed. */
function withTshirt(change: (matrix: MatrixFixture) => void): ProductsFixture {
  const products = drawnProducts();
  const shirt = products.products[0];
  if (shirt?.matrix) change(shirt.matrix);
  return products;
}

/** A new product with its name and price typed. */
async function named(page: Page, name: string, price: string): Promise<void> {
  await main(page).getByLabel('Name', { exact: true }).fill(name);
  await main(page).getByLabel('Price', { exact: true }).fill(price);
}

/** Add attribute: search, pick a row, take a role, Done. */
async function addAttribute(page: Page, name: string, role: RegExp): Promise<void> {
  await main(page).getByRole('button', { name: 'Add attribute' }).click();
  const add = sheet(page, 'Add attribute');
  await add.getByRole('searchbox').fill(name);
  await add
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await add.getByRole('radio', { name: role }).click();
  await add.getByRole('button', { name: 'Done' }).click();
}

/** The options sheet open: options typed in, one by one (each shown as `unit` says), then Done. */
async function typeOptions(
  page: Page,
  attribute: string,
  values: string[],
  unit = '',
): Promise<void> {
  const options = sheet(page, `${attribute} · options`);
  for (const value of values) {
    await options.getByLabel('Add option', { exact: true }).fill(value);
    await options.getByRole('button', { name: 'Insert' }).click();
    await expect(options.getByText(`${value}${unit}`, { exact: true })).toBeVisible();
  }
  await options.getByRole('button', { name: 'Done' }).click();
}

test('an existing product shows its options, a describing value and what each variant can sell', async ({
  page,
}) => {
  await open(page, 'p-1');
  await expect(card(page).getByRole('button', { name: 'Remove XXL' })).toBeVisible();
  await expect(card(page).getByText('100% cotton')).toBeVisible();
  // ATR-02: the type's suggestions not on the product yet.
  await expect(card(page).getByRole('button', { name: 'Fabric' })).toBeVisible();
  const table = card(page).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Variant',
    'PriceFill all',
    'Can sell',
    'SKU',
  ]);
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('row').nth(1)).toContainText('S · Black');
  await expect(table.getByRole('row').nth(1)).toContainText('6');
  await expect(table.getByLabel('Price of S · Black')).toHaveValue('');
  await expect(table.getByLabel('Price of S · Black')).toHaveAttribute('placeholder', '450');
  // INV-24: sharing is switched only while nothing is held.
  await expect(card(page).getByRole('switch', { name: 'Sizes share one stock' })).toBeDisabled();
  await expect(card(page).getByText('Can be switched on only once the stock is 0')).toBeVisible();
  await expectAccessible(page);
  await table.getByRole('button', { name: 'Show all 10' }).click();
  await expect(table.getByRole('row')).toHaveCount(12);
  await expect(table.getByText('XXL · Blue')).toBeVisible();
  // Its own price, where it has one.
  await expect(table.getByLabel('Price of XL · Black')).toHaveValue('490');
});

test('a price typed in a row, or filled for the variants of one option, is saved with the variants', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  const table = card(page).getByRole('table');
  await table.getByLabel('Price of L · Black').fill('470');
  await table.getByRole('button', { name: 'Fill all' }).click();
  const fill = sheet(page, 'Fill all · Price');
  await fill.getByLabel('Price', { exact: true }).fill('500');
  await fill.getByRole('button', { name: /^XL/ }).click();
  await fill.getByRole('button', { name: 'Fill 2 variants' }).click();
  await table.getByRole('button', { name: 'Show all 10' }).click();
  await expect(table.getByLabel('Price of XL · Blue')).toHaveValue('500');
  await expect(table.getByLabel('Price of XXL · Blue')).toHaveValue('490');
  await save(page).click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  const [body] = sent(log, 'PUT', '/products/p-1/variants');
  const prices = (body?.variants as { price: number | null }[]).map((each) => each.price);
  expect(prices).toEqual([null, null, null, null, 470, null, 500, 500, 490, 490]);
  expect(sent(log, 'PATCH', '/products/p-1')).toEqual([]);
  expect(sent(log, 'PUT', '/products/p-1/attributes')).toEqual([]);
});

test('removing an option whose variants hold stock asks first; Keep keeps it, Remove takes it out', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await card(page).getByRole('button', { name: 'Remove Blue' }).click();
  const ask = page.getByRole('dialog', { name: 'Remove Blue?' });
  await expect(ask).toContainText(
    'The 4 variants with Blue hold 22 in stock, such as S · Blue (5) and M · Blue (8). Once you save, they stop selling.',
  );
  await expectAccessible(page);
  await ask.getByRole('button', { name: 'Keep' }).click();
  await expect(card(page).getByRole('button', { name: 'Remove Blue' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Remove Blue' }).click();
  await ask.getByRole('button', { name: 'Remove' }).click();
  await expect(card(page).getByRole('button', { name: 'Remove Blue' })).toHaveCount(0);
  await expect(card(page).getByRole('table').getByRole('row')).toHaveCount(7);
  await save(page).click();
  await expect.poll(() => sent(log, 'PUT', '/products/p-1/variants').length).toBe(1);
  const [body] = sent(log, 'PUT', '/products/p-1/variants');
  expect(body?.variantAttributes).toEqual([
    { attributeId: 'a-1', optionIds: ['o-1-S', 'o-1-M', 'o-1-L', 'o-1-XL', 'o-1-XXL'] },
    { attributeId: 'a-2', optionIds: ['o-2-Black'] },
  ]);
});

test('an option whose variants hold nothing goes at once', async ({ page }) => {
  const products = withTshirt((matrix) => {
    for (const row of matrix.rows) if (row.optionIds.includes('o-1-XXL')) row.onHand = 0;
  });
  await open(page, 'p-1', { products });
  await card(page).getByRole('button', { name: 'Remove XXL' }).click();
  await expect(page.getByRole('dialog', { name: 'Remove XXL?' })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Remove XXL' })).toHaveCount(0);
});

test('an option typed in joins the product; its variants start at 0, marked New, the table open in full', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await card(page).getByRole('button', { name: 'Add option' }).first().click();
  await typeOptions(page, 'Size', ['3XL']);
  const table = card(page).getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(14);
  const fresh = table.getByRole('row').filter({ hasText: '3XL · Black' });
  await expect(fresh).toContainText('0 New');
  await expect(card(page).getByText(/A new variant starts at 0/)).toBeVisible();
  await save(page).click();
  await expect.poll(() => sent(log, 'PUT', '/products/p-1/variants').length).toBe(1);
  const [body] = sent(log, 'PUT', '/products/p-1/variants');
  expect((body?.variants as unknown[]).length).toBe(12);
  // Saved, its variants are the product's own; nothing is New any more.
  await expect(fresh).not.toContainText('New');
});

test('a library colour stays as it is; the shop’s own option takes a swatch, saved for every product', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await card(page).getByRole('button', { name: 'Add option' }).nth(1).click();
  const options = sheet(page, 'Colour · options');
  await expect(options.getByText('Library colour · fixed')).toHaveCount(2);
  await expect(options.getByRole('button', { name: 'Swatch of Black' })).toHaveCount(0);
  await options.getByLabel('Add option', { exact: true }).fill('Sky');
  await options.getByRole('button', { name: 'Insert' }).click();
  await options.getByRole('button', { name: 'Swatch of Sky' }).click();
  await expect(options.getByText('Swatch for Sky (optional)')).toBeVisible();
  await expectAccessible(page);
  await options.getByRole('button', { name: '#1D4ED8' }).click();
  await expect(options.getByText('Yours', { exact: true })).toBeVisible();
  const patched = log.calls.filter(
    (call) => call.method === 'PATCH' && call.path.startsWith('/attributes/a-2/options/'),
  );
  expect(patched.map((call) => call.body)).toEqual([{ swatchColor: '#1D4ED8' }]);
  await options.getByRole('button', { name: 'None' }).click();
  await expect
    .poll(() => log.calls.filter((call) => call.method === 'PATCH').map((call) => call.body))
    .toEqual([{ swatchColor: '#1D4ED8' }, { swatchColor: null }]);
});

test('an option set is inserted in one tap, its values reused, never doubled', async ({ page }) => {
  const log = await open(page, 'new');
  await named(page, 'Kurta', '900');
  await addAttribute(page, 'Size', /^Splits into variants/);
  const options = sheet(page, 'Size · options');
  await options.getByRole('button', { name: 'S–XXL' }).click();
  await expect(options.getByText('XXL', { exact: true })).toBeVisible();
  await options.getByRole('button', { name: 'Done' }).click();
  await expect(card(page).getByRole('table').getByRole('row')).toHaveCount(7);
  const [batch] = sent(log, 'POST', '/attributes/a-1/options/batch');
  expect(batch).toEqual({ values: ['S', 'M', 'L', 'XL', 'XXL'] });
});

test('Add attribute: a role the type cannot take says why; a new one is made in a step and picked', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await main(page).getByRole('button', { name: 'Add attribute' }).click();
  const add = sheet(page, 'Add attribute');
  await add.getByRole('searchbox').fill('Fi');
  await add.getByRole('button', { name: /^Fit/ }).click();
  await expect(add.getByRole('radio', { name: /Asked when ordering/ })).toBeDisabled();
  await expect(add.getByRole('radio', { name: /Asked when ordering/ })).toContainText(
    'Only for text or a number',
  );
  await add.getByRole('searchbox').fill('Finish');
  await add.getByRole('button', { name: 'Create "Finish"' }).click();
  const step = sheet(page, 'New attribute');
  await expect(step.getByLabel('Name', { exact: true })).toHaveValue('Finish');
  await expect(step.getByText('The type cannot change later.')).toBeVisible();
  await expectAccessible(page);
  await step.getByRole('button', { name: 'Create and pick' }).click();
  await expect(add.getByText('Options · Yours · just made')).toBeVisible();
  await expect(add.getByRole('radio', { name: /Splits into variants/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(sent(log, 'POST', '/attributes')).toEqual([{ name: 'Finish', dataType: 'enum_single' }]);
  await add.getByRole('button', { name: 'Done' }).click();
  // Every combination gains an option, so the variants there now stop selling once saved: asked first.
  const ask = page.getByRole('dialog', { name: 'Split by Finish?' });
  await expect(ask).toContainText('The variants there now hold 54 in stock.');
  await ask.getByRole('button', { name: 'Split it' }).click();
  await typeOptions(page, 'Finish', ['Matte']);
  await expect(card(page).getByRole('table').getByRole('row').nth(1)).toContainText(
    'S · Black · Matte',
  );
});

test('a fourth splitting attribute is refused, naming the three', async ({ page }) => {
  const products = withTshirt((matrix) => {
    matrix.splits.push({ attributeId: 'a-5', optionIds: ['o-5-Half'] });
    for (const row of matrix.rows) row.optionIds.push('o-5-Half');
  });
  await open(page, 'p-1', { products });
  await main(page).getByRole('button', { name: 'Add attribute' }).click();
  const add = sheet(page, 'Add attribute');
  await add.getByRole('searchbox').fill('Fit');
  await add.getByRole('button', { name: /^Fit/ }).click();
  await expect(add.getByRole('radio', { name: /Splits into variants/ })).toBeDisabled();
  await expect(add.getByRole('radio', { name: /Splits into variants/ })).toContainText(
    'Already split by 3: Size, Colour, Sleeve',
  );
});

test('describing values are entered by their type and saved together', async ({ page }) => {
  const log = await open(page, 'p-1');
  await card(page)
    .getByRole('button', { name: /^Material/ })
    .click();
  const material = sheet(page, 'Material');
  await expect(material.getByText('Describes · Text')).toBeVisible();
  await material.getByLabel('Value', { exact: true }).fill('Combed cotton');
  await material.getByRole('button', { name: 'Done' }).click();
  await expect(card(page).getByText('Combed cotton')).toBeVisible();

  await addAttribute(page, 'Waterproof', /^Describes/);
  await sheet(page, 'Waterproof').getByRole('radio', { name: 'Yes' }).click();
  await sheet(page, 'Waterproof').getByRole('button', { name: 'Done' }).click();

  await addAttribute(page, 'Net weight', /^Describes/);
  const weight = sheet(page, 'Net weight');
  await weight.getByRole('radio', { name: 'kg' }).click();
  await weight.getByLabel('Value', { exact: true }).fill('1.5');
  await weight.getByRole('button', { name: 'Done' }).click();
  await expect(card(page).getByText('1.5 kg')).toBeVisible();

  await addAttribute(page, 'Compatible models', /^Describes/);
  const models = sheet(page, 'Compatible models');
  await models.getByRole('button', { name: 'iPhone 13' }).click();
  await models.getByRole('button', { name: 'iPhone 14', exact: true }).click();
  await models.getByRole('button', { name: 'Done' }).click();
  await expect(card(page).getByText('iPhone 13, iPhone 14')).toBeVisible();
  await expectAccessible(page);

  await save(page).click();
  await expect.poll(() => sent(log, 'PUT', '/products/p-1/attributes').length).toBe(1);
  expect(sent(log, 'PUT', '/products/p-1/attributes')).toEqual([
    {
      attributes: [
        { attributeId: 'a-3', role: 'informational', textValue: 'Combed cotton' },
        { attributeId: 'a-7', role: 'informational', boolValue: true },
        { attributeId: 'a-9', role: 'informational', numberValue: 1500 },
        { attributeId: 'a-6', role: 'informational', optionIds: ['o-6-13', 'o-6-14'] },
      ],
    },
  ]);
  expect(sent(log, 'PUT', '/products/p-1/variants')).toEqual([]);
});

test('a new product made to order: two attributes split it, one is asked when ordering, all in one request', async ({
  page,
}) => {
  const products: ProductsFixture = {
    ...drawnProducts(),
    defaults: {
      presetKey: 'food_bakery',
      stockTracking: 'not_tracked',
      suggestedAttributeIds: ['a-1'],
    },
  };
  const log = await open(page, 'new', { products });
  await named(page, 'Chocolate cake', '850');
  await addAttribute(page, 'Size', /^Splits into variants/);
  await typeOptions(page, 'Size', ['1 lb', '2 lb']);
  await main(page).getByRole('button', { name: 'Add attribute' }).click();
  const add = sheet(page, 'Add attribute');
  await add.getByRole('searchbox').fill('Flavour');
  await add.getByRole('button', { name: 'Create "Flavour"' }).click();
  await sheet(page, 'New attribute').getByRole('button', { name: 'Create and pick' }).click();
  await add.getByRole('button', { name: 'Done' }).click();
  await typeOptions(page, 'Flavour', ['Chocolate', 'Vanilla']);
  await main(page).getByRole('button', { name: 'Add attribute' }).click();
  await add.getByRole('searchbox').fill('Message on the cake');
  await add.getByRole('button', { name: 'Create "Message on the cake"' }).click();
  const step = sheet(page, 'New attribute');
  await step.getByRole('button', { name: 'Text', exact: true }).click();
  await step.getByRole('button', { name: 'Create and pick' }).click();
  await add.getByRole('radio', { name: /^Asked when ordering/ }).click();
  await add.getByRole('button', { name: 'Done' }).click();
  await expect(card(page).getByText('The shopper writes it when ordering · text')).toBeVisible();
  const table = card(page).getByRole('table');
  // Made to order: a price per variant, nothing on a shelf.
  await expect(table.getByRole('columnheader')).toHaveText(['Variant', 'PriceFill all']);
  await expect(table.getByRole('row').nth(2)).toContainText('1 lb · Vanilla');
  await table.getByLabel('Price of 2 lb · Chocolate').fill('1600');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  const [body] = sent(log, 'POST', '/products');
  expect(body?.variantAttributes).toHaveLength(2);
  expect(body?.variants).toEqual([
    { optionIds: [expect.any(String), expect.any(String)], price: null, sku: null },
    { optionIds: [expect.any(String), expect.any(String)], price: null, sku: null },
    { optionIds: [expect.any(String), expect.any(String)], price: 1600, sku: null },
    { optionIds: [expect.any(String), expect.any(String)], price: null, sku: null },
  ]);
  expect(body?.attributes).toEqual([
    { attributeId: expect.any(String), role: 'captured_at_order' },
  ]);
});

test('the variants share one stock: each pack says what it holds, the stock opens in kg', async ({
  page,
}) => {
  const products: ProductsFixture = {
    ...drawnProducts(),
    defaults: { presetKey: 'grocery', stockUnit: 'kg', suggestedAttributeIds: ['a-8'] },
  };
  const log = await open(page, 'new', { products });
  await named(page, 'Miniket rice', '78');
  await addAttribute(page, 'Pack size', /^Splits into variants/);
  const options = sheet(page, 'Pack size · options');
  await options.getByRole('radio', { name: 'kg' }).click();
  await typeOptions(page, 'Pack size', ['5', '10'], ' kg');
  await expect(card(page).getByRole('button', { name: 'Remove 5 kg' })).toBeVisible();
  await card(page).getByRole('switch', { name: 'Sizes share one stock' }).click();
  await expect(
    card(page).getByText('One stock in kg; selling a pack takes its amount off it.'),
  ).toBeVisible();
  const table = card(page).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Pack',
    'Pack holds',
    'PriceFill all',
    'SKU',
  ]);
  await table.getByLabel('Pack of 5 kg').fill('5');
  await table.getByLabel('Pack of 10 kg').fill('10');
  await card(page).getByLabel('Opening stock, kg').fill('240');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  const [body] = sent(log, 'POST', '/products');
  expect(body).toMatchObject({
    sharedStock: true,
    sharedOpeningStock: 240,
    variants: [{ packAmount: 5 }, { packAmount: 10 }],
  });
  expect((body?.variants as Record<string, unknown>[])[0]).not.toHaveProperty('openingStock');
});

test('past 100 variants the table gives way to what to do, and nothing is saved', async ({
  page,
}) => {
  const sizes = Array.from({ length: 10 }, (_, index) => `S${String(index + 1)}`);
  const colours = Array.from({ length: 10 }, (_, index) => `C${String(index + 1)}`);
  const library = drawnLibrary();
  const size = library.find((each) => each.id === 'a-1');
  const colour = library.find((each) => each.id === 'a-2');
  if (size) size.options = sizes.map((value) => ({ id: `o-1-${value}`, value, scope: 'shop' }));
  if (colour)
    colour.options = colours.map((value) => ({ id: `o-2-${value}`, value, scope: 'shop' }));
  const products = withTshirt((matrix) => {
    matrix.splits = [
      { attributeId: 'a-1', optionIds: sizes.map((value) => `o-1-${value}`) },
      { attributeId: 'a-2', optionIds: colours.map((value) => `o-2-${value}`) },
    ];
    matrix.rows = sizes.flatMap((s, i) =>
      colours.map((c, j) => ({
        id: `p-1-v${String(i * 10 + j + 1)}`,
        optionIds: [`o-1-${s}`, `o-2-${c}`],
        price: null,
        sku: null,
        onHand: 0,
      })),
    );
  });
  products.library = library;
  const log = await open(page, 'p-1', { products });
  await card(page).getByRole('button', { name: 'Add option' }).first().click();
  await typeOptions(page, 'Size', ['S11']);
  await expect(card(page).getByRole('alert')).toHaveText(
    'Size × Colour make 110 variants; at most 100. Remove some options, or make two products.',
  );
  await expect(card(page).getByRole('table')).toHaveCount(0);
  await expect(save(page)).toHaveText('Fix 1 thing to save');
  await save(page).click();
  expect(sent(log, 'PUT', '/products/p-1/variants')).toEqual([]);
});

test('an SKU another variant has is refused on its row, everything typed kept', async ({
  page,
}) => {
  const products = { ...drawnProducts(), refuse: { sku: 'TS-M-BL' } };
  await open(page, 'p-1', { products });
  const table = card(page).getByRole('table');
  await table.getByLabel('SKU of S · Black').fill('TS-M-BL');
  await save(page).click();
  await expect(card(page).getByText('Another variant has that SKU.')).toBeVisible();
  await expect(table.getByLabel('SKU of S · Black')).toHaveAttribute('aria-invalid', 'true');
  await expect(table.getByLabel('SKU of S · Black')).toHaveValue('TS-M-BL');
  await expect(save(page)).toHaveText('Fix 1 thing to save');
});

test('without stock to see there is no Can sell; without products to manage nothing changes', async ({
  page,
}) => {
  await open(page, 'p-1', { isOwner: false, permissions: ['products:read', 'products:manage'] });
  await expect(card(page).getByRole('table').getByRole('columnheader')).toHaveText([
    'Variant',
    'PriceFill all',
    'SKU',
  ]);
  await open(page, 'p-1', { isOwner: false, permissions: ['products:read', 'inventory:read'] });
  await expect(main(page).getByRole('button', { name: 'Add attribute' })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Remove Blue' })).toHaveCount(0);
  await expect(card(page).getByLabel('Price of S · Black')).toHaveJSProperty('readOnly', true);
});
