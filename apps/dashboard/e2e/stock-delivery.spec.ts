import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts, type ProductsFixture } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.4 and §7.4a, Slice 11.7c (Part 15): the form by shop type -- the defaults line, the type's
// up-front card and what it sets -- Stock and delivery with Adjust by weight, Delivers to and the payment policy, made to
// order asking first, the size chart as the category's or a table of its own, a variant's own settings, a product with
// no options' SKU and barcode under More settings, serials refused on a measured unit, and a category of another type
// bringing its defaults with Undo. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products/${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function stock(page: Page) {
  return main(page).getByRole('region', { name: 'Stock and delivery' });
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

/** A new product with its name and price typed. */
async function named(page: Page, name: string, price: string): Promise<void> {
  await main(page).getByLabel('Name', { exact: true }).fill(name);
  await main(page).getByLabel('Price', { exact: true }).fill(price);
}

/** The drawn shop whose new products start as another type's (PST-02). */
function typed(defaults: Record<string, unknown>): ProductsFixture {
  return { ...drawnProducts(), defaults };
}

const PHONES = {
  presetKey: 'mobiles_gadgets',
  serialTracked: true,
  serialFormat: 'imei',
  lowStockThreshold: '2.000',
  suggestedAttributeIds: [],
  upFrontFields: ['serialTracked', 'itemCondition'],
};

test('a saved product: its defaults line without change, a weight adjusting the charge, one PATCH of what changed', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await expect(main(page).getByText('Defaults: Clothing')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'change' })).toHaveCount(0);
  await expect(stock(page).getByRole('radio', { name: 'Stock is tracked' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(stock(page).getByLabel('Unit')).toHaveValue('piece');
  await expect(stock(page).getByLabel('Low-stock alert at')).toHaveValue('5');
  await expect(stock(page).getByLabel('Weight (kg)')).toHaveValue('0.25');
  // With options, its SKUs and barcodes are the variants' own, not under More settings.
  await main(page).getByText('More settings', { exact: true }).click();
  await expect(main(page).getByLabel('SKU', { exact: true })).toHaveCount(0);
  // PRD-16: with no weight there is no switch; one typed adjusts the charge.
  await stock(page).getByLabel('Weight (kg)').fill('');
  await expect(stock(page).getByRole('switch', { name: 'Adjust by weight' })).toHaveCount(0);
  await stock(page).getByLabel('Low-stock alert at').fill('3');
  await stock(page).getByLabel('Weight (kg)').fill('0.4');
  await expect(stock(page).getByRole('switch', { name: 'Adjust by weight' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await stock(page).getByLabel('Delivery charge').fill('60');
  await expectAccessible(page);
  await save(page).click();
  await expect
    .poll(() => sent(log, 'PATCH', '/products/p-1'))
    .toEqual([{ lowStockThreshold: 3, weightKg: 0.4, deliveryCharge: 60 }]);
  await expect(stock(page).getByLabel('Weight (kg)')).toHaveValue('0.4');

  // Turned off, the charge stays as it is.
  await stock(page).getByRole('switch', { name: 'Adjust by weight' }).click();
  await save(page).click();
  await expect
    .poll(() => sent(log, 'PATCH', '/products/p-1').at(1))
    .toEqual({ deliveryMode: 'default' });
});

test('Delivers to: only the chosen zones, never one the shop skips, saved by its own request', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await stock(page)
    .getByRole('button', { name: /^Delivers to/ })
    .click();
  const zones = sheet(page, 'Delivers to');
  await expect(zones.getByRole('radio', { name: 'Wherever the shop delivers' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await zones.getByRole('radio', { name: 'Only chosen zones' }).click();
  await expect(zones.getByText('Hill districts')).toHaveCount(0);
  await zones.getByRole('checkbox', { name: /Inside Dhaka city/ }).click();
  await expectAccessible(page);
  await zones.getByRole('button', { name: 'Done' }).click();
  await expect(stock(page).getByRole('button', { name: /^Delivers to/ })).toContainText(
    'Inside Dhaka city',
  );
  await save(page).click();
  await expect
    .poll(() => sent(log, 'PUT', '/products/p-1/delivery-zones'))
    .toEqual([{ zoneIds: ['z-in'] }]);
  expect(sent(log, 'PATCH', '/products/p-1')).toEqual([]);
});

test('the payment policy: the shop default named, a partial advance needing its amount, then saved with it', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  const field = stock(page).getByRole('button', { name: /^Payment policy/ });
  await expect(field).toContainText('Shop default · cash on delivery');
  await field.click();
  const policy = sheet(page, 'Payment policy');
  await policy.getByRole('radio', { name: /^Partial advance/ }).click();
  await policy.getByRole('button', { name: 'Done' }).click();
  await expect(policy.getByRole('alert')).toHaveText('Give the advance’s amount');
  await policy.getByLabel('Advance', { exact: true }).fill('200');
  await policy.getByRole('button', { name: 'Done' }).click();
  await expect(field).toContainText('Advance ৳200');
  await save(page).click();
  await expect
    .poll(() => sent(log, 'PATCH', '/products/p-1'))
    .toEqual([{ paymentPolicy: 'partial_advance', advanceAmount: 200 }]);
});

test('made to order: a product holding stock asks first; Keep counting keeps it, Make to order saves it', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  const madeToOrder = stock(page).getByRole('radio', { name: 'Made to order (no stock)' });
  await madeToOrder.click();
  const asked = sheet(page, 'Make it to order?');
  await expect(asked).toContainText('Cotton T-shirt holds 54 in stock.');
  await expectAccessible(page);
  await asked.getByRole('button', { name: 'Keep counting' }).click();
  await expect(stock(page).getByRole('radio', { name: 'Stock is tracked' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await madeToOrder.click();
  await asked.getByRole('button', { name: 'Make to order' }).click();
  await expect(madeToOrder).toHaveAttribute('aria-checked', 'true');
  // INV-02: nothing to count, so no unit or alert.
  await expect(stock(page).getByLabel('Unit')).toHaveCount(0);
  await save(page).click();
  await expect
    .poll(() => sent(log, 'PATCH', '/products/p-1'))
    .toEqual([{ stockTracking: 'not_tracked' }]);
});

test("the size chart: the category's, then a table of its own saved by its own request, then the category's again", async ({
  page,
}) => {
  const products: ProductsFixture = {
    ...drawnProducts(),
    charts: {
      'c-tshirts': [
        ['Size', 'Chest'],
        ['M', '38'],
      ],
    },
  };
  const log = await open(page, 'p-1', { products });
  const upFront = main(page).getByRole('region', { name: 'Clothing' });
  const field = upFront.getByRole('button', { name: /^Uses the category's chart · T-shirts/ });
  await field.click();
  const chart = sheet(page, 'Size chart');
  await expect(
    chart.getByRole('radio', { name: "Use the category's chart · T-shirts" }),
  ).toHaveAttribute('aria-checked', 'true');
  await chart.getByRole('radio', { name: "This product's own chart" }).click();
  await expect(chart.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'true');
  // The corner stays empty; the first row names the measures, the first column the sizes.
  await expect(chart.getByLabel('Row 1, column 1')).toHaveCount(0);
  await chart.getByLabel('Row 1, column 2').fill('Chest ');
  await chart.getByLabel('Row 2, column 1').fill('M');
  await chart.getByLabel('Row 2, column 2').fill('40');
  // A row left empty is dropped.
  await chart.getByRole('button', { name: 'Add row' }).click();
  await expect(chart.getByLabel('Row 3, column 1')).toBeVisible();
  await expectAccessible(page);
  await chart.getByRole('button', { name: 'Done' }).click();
  await expect(upFront.getByRole('button', { name: /^Own chart/ })).toBeVisible();
  await save(page).click();
  await expect
    .poll(() => sent(log, 'PUT', '/products/p-1/size-chart'))
    .toEqual([
      {
        rows: [
          ['', 'Chest'],
          ['M', '40'],
        ],
      },
    ]);

  await upFront.getByRole('button', { name: /^Own chart/ }).click();
  await chart.getByRole('radio', { name: "Use the category's chart · T-shirts" }).click();
  await chart.getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect.poll(() => sent(log, 'DELETE', '/products/p-1/size-chart').length).toBe(1);
  await expect(field).toBeVisible();
});

test("a variant's own settings: its name opens them, empty follows the product, saved with the variants", async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await main(page).getByRole('button', { name: 'Settings of M · Black' }).click();
  const variant = sheet(page, 'M · Black');
  await expect(variant.getByLabel('SKU')).toHaveValue('TS-M-BL');
  await expect(variant.getByLabel('Delivery charge')).toHaveAttribute(
    'placeholder',
    'Follows the zone charge',
  );
  await variant.getByLabel('Barcode').fill('8941100500123');
  await variant.getByRole('switch', { name: 'On sale' }).click();
  await expectAccessible(page);
  await variant.getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect.poll(() => sent(log, 'PUT', '/products/p-1/variants').length).toBe(1);
  const [body] = sent(log, 'PUT', '/products/p-1/variants');
  const rows = body?.variants as Record<string, unknown>[];
  expect(rows.find((row) => row.sku === 'TS-M-BL')).toMatchObject({
    barcode: '8941100500123',
    active: false,
  });
  expect(rows.filter((row) => row.active === false)).toHaveLength(1);
});

test('a new phone: serials (IMEI) and condition up front, what the type sets, serials refused on a measured unit', async ({
  page,
}) => {
  const log = await open(page, 'new', { products: typed(PHONES) });
  await expect(main(page).getByText('Defaults: Mobiles and gadgets')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'change' })).toBeVisible();
  const upFront = main(page).getByRole('region', { name: 'Mobiles and gadgets' });
  await expect(
    upFront.getByRole('switch', { name: 'A serial number on every unit' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(upFront).toContainText('IMEI');
  await expect(upFront.getByRole('radio', { name: 'New' })).toHaveAttribute('aria-checked', 'true');
  await expect(main(page).getByText('What this shop type sets')).toBeVisible();
  await expect(stock(page).getByLabel('Low-stock alert at')).toHaveValue('2');
  // What is up front is not repeated under More settings.
  await main(page).getByText('More settings', { exact: true }).click();
  await expect(
    main(page).getByRole('switch', { name: 'A serial number on every unit' }),
  ).toHaveCount(1);

  await named(page, 'Galaxy A16', '21500');
  await stock(page).getByLabel('Unit').selectOption('kg');
  await expect(stock(page).getByLabel('Unit')).toHaveAccessibleDescription(
    'A product counted in a measured unit cannot carry serials: count it in pieces or turn serials off',
  );
  await expect(save(page)).toHaveText('Fix 1 thing to save');
  await save(page).click();
  expect(sent(log, 'POST', '/products')).toEqual([]);
  await stock(page).getByLabel('Unit').selectOption('piece');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  expect(sent(log, 'POST', '/products')[0]).toMatchObject({
    name: 'Galaxy A16',
    stockUnit: 'piece',
    serialTracked: true,
    serialFormat: 'imei',
    condition: 'new',
    lowStockThreshold: 2,
  });
});

test('a book with no options: its SKU and barcode under More settings, sent with its one variant', async ({
  page,
}) => {
  const log = await open(page, 'new', {
    products: typed({
      presetKey: 'books_stationery',
      suggestedAttributeIds: [],
      upFrontFields: [],
    }),
  });
  await expect(main(page).getByText('This type shows nothing extra up front')).toBeVisible();
  await named(page, 'Pather Panchali', '320');
  await stock(page).getByLabel('Opening stock').fill('12');
  await main(page).getByText('More settings', { exact: true }).click();
  await main(page).getByLabel('SKU').fill('PP-0320');
  await main(page).getByLabel('Barcode').fill('9789845020181');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  expect(sent(log, 'POST', '/products')[0]?.variants).toEqual([
    { optionIds: [], sku: 'PP-0320', barcode: '9789845020181', openingStock: 12 },
  ]);
});

test('a category of another type brings its defaults, except what was typed, said with Undo', async ({
  page,
}) => {
  const products: ProductsFixture = {
    ...drawnProducts(),
    categoryDefaults: { 'c-accessories': PHONES },
  };
  await open(page, 'new', { products });
  await expect(main(page).getByText('Defaults: Clothing')).toBeVisible();
  await stock(page).getByLabel('Low-stock alert at').fill('9');
  // "change" opens the category picker (PST-06).
  await main(page).getByRole('button', { name: 'change' }).click();
  const picker = sheet(page, 'Pick categories');
  await picker.getByRole('checkbox', { name: 'Accessories' }).check();
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByText('Defaults: Mobiles and gadgets')).toBeVisible();
  await expect(main(page).getByText(/^Filed under/)).toHaveText(
    'Filed under "Accessories", which behaves like Mobiles and gadgets: serials turned on (IMEI) and condition came up front.',
  );
  const upFront = main(page).getByRole('region', { name: 'Mobiles and gadgets' });
  await expect(
    upFront.getByRole('switch', { name: 'A serial number on every unit' }),
  ).toHaveAttribute('aria-checked', 'true');
  // Typed by hand, so kept.
  await expect(stock(page).getByLabel('Low-stock alert at')).toHaveValue('9');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Undo' }).click();
  await expect(main(page).getByText(/^Filed under/)).toHaveCount(0);
  await expect(
    upFront.getByRole('switch', { name: 'A serial number on every unit' }),
  ).toHaveAttribute('aria-checked', 'false');
});

test('without products to manage, stock and delivery is only shown', async ({ page }) => {
  await open(page, 'p-1', { isOwner: false, permissions: ['products:read', 'inventory:read'] });
  await expect(stock(page).getByRole('radio', { name: 'Made to order (no stock)' })).toBeDisabled();
  await expect(stock(page).getByLabel('Low-stock alert at')).toHaveJSProperty('readOnly', true);
  await expect(stock(page).getByRole('button', { name: /^Delivers to/ })).toBeDisabled();
  await expect(stock(page).getByRole('button', { name: /^Payment policy/ })).toBeDisabled();
  await expect(save(page)).toHaveCount(0);
});
