import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts, type ProductsFixture } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.4, Slice 11.7c step 2 (Part 15's `pf-sh-batch`, `pf-sh-serials`; Part 16): a new product's
// stock on the shelf as an opening batch with its unit cost, and its units' serials by Scan, Paste a list or Type --
// each line checked by its format, against the list and the shop, the flagged ones left out, the list full at the
// opening stock -- with a camera that reads codes, none, or one the browser blocks. Each test runs on a phone and on a
// desktop.

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products/new`);
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

async function named(page: Page, name: string, price: string): Promise<void> {
  await main(page).getByLabel('Name', { exact: true }).fill(name);
  await main(page).getByLabel('Price', { exact: true }).fill(price);
}

/** Size added to split the product, with its options typed. */
async function sizes(page: Page, values: string[]): Promise<void> {
  await main(page).getByRole('button', { name: 'Add attribute' }).click();
  const add = sheet(page, 'Add attribute');
  await add.getByRole('searchbox').fill('Size');
  await add.getByRole('button', { name: /^Size/ }).first().click();
  await add.getByRole('radio', { name: /^Splits into variants/ }).click();
  await add.getByRole('button', { name: 'Done' }).click();
  const options = sheet(page, 'Size · options');
  for (const value of values) {
    await options.getByLabel('Add option', { exact: true }).fill(value);
    await options.getByRole('button', { name: 'Insert' }).click();
    await expect(options.getByText(value, { exact: true })).toBeVisible();
  }
  await options.getByRole('button', { name: 'Done' }).click();
}

/** A shop whose new products start as another type's (PST-02). */
function typed(defaults: Record<string, unknown>, more: Partial<ProductsFixture> = {}): ShopState {
  return { products: { ...drawnProducts(), ...more, defaults } };
}

const PHARMACY = {
  presetKey: 'pharmacy',
  stockUnit: 'box',
  batchTracked: true,
  suggestedAttributeIds: [],
  upFrontFields: ['batchTracked'],
};
const PHONES = {
  presetKey: 'mobiles_gadgets',
  serialTracked: true,
  serialFormat: 'imei',
  suggestedAttributeIds: [],
  upFrontFields: ['serialTracked', 'itemCondition'],
};
const FANS = { ...PHONES, presetKey: 'electronics', serialFormat: 'any' };

// Valid IMEIs (15 digits, the check digit right), one with a wrong check digit, and one the shop holds.
const IMEI_A = '356789104567894';
const IMEI_B = '356789104567910';
const IMEI_C = '356789104567928';
const IMEI_BAD = '356789104567895';
const IMEI_HELD = '356789104567902';

/** A phone's camera, read by a stand-in BarcodeDetector: each look sees the next code given. */
async function camera(page: Page, codes: string[]): Promise<void> {
  await page.addInitScript((seen: string[]) => {
    const queue = [...seen];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          canvas.getContext('2d')?.fillRect(0, 0, 320, 240);
          return Promise.resolve(canvas.captureStream());
        },
      },
    });
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class {
        static getSupportedFormats(): Promise<string[]> {
          return Promise.resolve(['code_128', 'qr_code']);
        }
        detect(): Promise<{ rawValue: string }[]> {
          const next = queue.shift();
          return Promise.resolve(next ? [{ rawValue: next }] : []);
        }
      },
    });
  }, codes);
}

test('a medicine with no options: its opening stock is a batch with its expiry and unit cost', async ({
  page,
}) => {
  const log = await open(page, typed(PHARMACY));
  await named(page, 'Napa Extra', '36');
  const field = stock(page).getByRole('button', { name: /^Opening stock/ });
  await expect(field).toContainText('batch');
  await field.click();
  const batch = sheet(page, 'Opening batch');
  await expect(batch).toContainText('Napa Extra');
  await batch.getByLabel('Quantity').fill('40');
  await batch.getByLabel('Batch code (optional)').fill('NP-2602');
  await batch.getByLabel('Expiry date (optional)').fill('2020-01-31');
  await batch.getByLabel('Unit cost (optional)').fill('30');
  await batch.getByRole('button', { name: 'Done' }).click();
  // INV-12: an expiry already past is refused, as the server would.
  await expect(batch.getByText('That date has passed; give today or a later one.')).toBeVisible();
  await batch.getByLabel('Expiry date (optional)').fill('2028-02-29');
  await expectAccessible(page);
  await batch.getByRole('button', { name: 'Done' }).click();
  await expect(field).toContainText('40 · exp 2028-02');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  expect(sent(log, 'POST', '/products')[0]?.variants).toEqual([
    {
      optionIds: [],
      sku: null,
      barcode: null,
      openingStock: 40,
      openingBatch: { batchCode: 'NP-2602', expiresOn: '2028-02-29' },
      openingUnitCost: 30,
    },
  ]);
});

test('a lipstick by size: each size its own opening batch, from its cell', async ({ page }) => {
  const log = await open(page, typed({ ...PHARMACY, presetKey: 'cosmetics', stockUnit: 'piece' }));
  await named(page, 'Matte Lipstick', '650');
  await sizes(page, ['S', 'M']);
  const table = main(page).getByRole('region', { name: 'Options and variants' }).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Variant',
    'PriceFill all',
    'Opening batch',
  ]);
  const cell = table.getByRole('button', { name: 'Opening batch of S' });
  await expect(cell).toHaveText('add batch');
  await cell.click();
  const batch = sheet(page, 'Opening batch');
  await expect(batch).toContainText('Matte Lipstick · S');
  await batch.getByLabel('Quantity').fill('24');
  await batch.getByLabel('Expiry date (optional)').fill('2027-08-31');
  await batch.getByLabel('Unit cost (optional)').fill('410');
  await batch.getByRole('button', { name: 'Done' }).click();
  await expect(cell).toHaveText('24 · exp 2027-08');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  const [body] = sent(log, 'POST', '/products');
  expect(body?.variants).toMatchObject([
    { openingStock: 24, openingBatch: { expiresOn: '2027-08-31' }, openingUnitCost: 410 },
    {},
  ]);
  expect(JSON.stringify((body?.variants as unknown[])[1])).not.toContain('opening');
});

test('a phone by size: serials typed one by one, each checked, the flagged ones left out, full at the stock', async ({
  page,
}) => {
  const log = await open(page, typed(PHONES, { takenSerials: [IMEI_HELD] }));
  await named(page, 'Galaxy A16', '21500');
  await sizes(page, ['128 GB', '256 GB']);
  const table = main(page).getByRole('region', { name: 'Options and variants' }).getByRole('table');
  // A new product with serials shows its opening serials where others show the SKU.
  await expect(table.getByRole('columnheader')).toHaveText([
    'Variant',
    'PriceFill all',
    'Opening stockFill all',
    'Opening serials',
  ]);
  await table.getByLabel('Opening stock of 128 GB').fill('2');
  const cell = table.getByRole('button', { name: 'Opening serials of 128 GB' });
  await expect(cell).toHaveText('add IMEIs');
  await cell.click();
  const serials = sheet(page, 'Opening serials');
  await expect(serials).toContainText('Galaxy A16 · 128 GB · 2 units');
  await serials.getByRole('tab', { name: 'Type' }).click();
  const box = serials.getByLabel('Type an IMEI');
  for (const code of [IMEI_A, IMEI_A, '35678910456', IMEI_BAD, IMEI_HELD]) {
    await box.fill(code);
    await box.press('Enter');
  }
  const list = serials.getByRole('list', { name: 'Opening serials' });
  await expect(list.getByRole('listitem')).toHaveText([
    `${IMEI_A}OK`,
    `${IMEI_A}twice in this list`,
    '35678910456not 15 digits',
    `${IMEI_BAD}not a valid IMEI`,
    `${IMEI_HELD}already in the shop`,
  ]);
  await expect(serials).toContainText('1 of 2 entered · the rest can come later');
  await expect(serials).toContainText(
    '4 flagged are not saved: fix and add them again, or remove them.',
  );
  await expectAccessible(page);
  await serials.getByRole('button', { name: `Remove ${IMEI_BAD}` }).click();
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await expect(list).not.toContainText(IMEI_BAD);
  // The second unit's serial fills it: no more can be added until the opening stock is raised.
  await box.fill(IMEI_B);
  await box.press('Enter');
  await expect(serials).toContainText(
    'All 2 units have a serial. To add more, raise the opening stock first.',
  );
  await expect(serials.getByLabel('Type an IMEI')).toHaveCount(0);
  await serials.getByRole('button', { name: 'Done' }).click();
  await expect(cell).toHaveText('2 / 2');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  expect(sent(log, 'POST', '/serials/check').map((body) => body.serials)).toEqual([
    [IMEI_A],
    [IMEI_HELD],
    [IMEI_B],
  ]);
  const [body] = sent(log, 'POST', '/products');
  expect(body?.variants).toMatchObject([{ openingStock: 2, openingSerials: [IMEI_A, IMEI_B] }, {}]);
});

test('a table fan: serials pasted as a list, what does not fit left in the box', async ({
  page,
}) => {
  const log = await open(page, typed(FANS));
  await named(page, 'Rechargeable Table Fan', '3200');
  const field = stock(page).getByLabel('Opening stock');
  await field.fill('2');
  await stock(page).getByRole('button', { name: 'Opening serials' }).click();
  const serials = sheet(page, 'Opening serials');
  // Not an IMEI: any code, asked as one.
  await serials.getByRole('tab', { name: 'Type' }).click();
  await expect(serials.getByLabel('Type a serial')).toBeVisible();
  await serials.getByRole('tab', { name: 'Paste a list' }).click();
  await serials
    .getByLabel('Paste the list here')
    .fill('vf-2026-0001, VF#0002\nVF-2026-0003\nVF-2026-0004');
  await serials.getByRole('button', { name: 'Add the list' }).click();
  const list = serials.getByRole('list', { name: 'Opening serials' });
  await expect(list.getByRole('listitem')).toHaveText([
    'VF-2026-0001OK',
    'VF#0002letters, digits and dashes only',
    'VF-2026-0003OK',
  ]);
  await expect(serials).toContainText('All 2 units have a serial.');
  await serials.getByRole('tab', { name: 'Paste a list' }).click();
  await serials.getByRole('button', { name: 'Done' }).click();
  await expect(stock(page).getByRole('button', { name: 'Opening serials' })).toHaveText('2 / 2');
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  expect(sent(log, 'POST', '/products')[0]?.variants).toEqual([
    {
      optionIds: [],
      sku: null,
      barcode: null,
      openingStock: 2,
      openingSerials: ['VF-2026-0001', 'VF-2026-0003'],
    },
  ]);
});

test('the camera reads each code once; with no opening stock the sheet asks for it first', async ({
  page,
}) => {
  await camera(page, [IMEI_A, IMEI_A, IMEI_A, IMEI_C]);
  await open(page, typed(PHONES));
  await named(page, 'Galaxy A16', '21500');
  await stock(page).getByRole('button', { name: 'Opening serials' }).click();
  const serials = sheet(page, 'Opening serials');
  await expect(serials).toContainText('Type the opening stock first: each unit takes one serial.');
  await serials.getByRole('button', { name: 'Done' }).click();
  await stock(page).getByLabel('Opening stock').fill('3');
  await stock(page).getByRole('button', { name: 'Opening serials' }).click();
  await expect(
    serials.getByText('Hold the barcode to the camera · one scan per unit'),
  ).toBeVisible();
  const list = serials.getByRole('list', { name: 'Opening serials' });
  await expect(list.getByRole('listitem')).toHaveText([`${IMEI_A}OK`, `${IMEI_C}OK`]);
  await expect(serials).toContainText('2 of 3 entered');
});

test('with no camera Scan says so; a camera the browser blocks says how to allow it, with Try again', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
  await open(page, typed(PHONES));
  await stock(page).getByLabel('Opening stock').fill('1');
  await stock(page).getByRole('button', { name: 'Opening serials' }).click();
  const serials = sheet(page, 'Opening serials');
  await expect(serials).toContainText(
    'This device has no camera to scan with. Paste a list or type them.',
  );

  const other = await page.context().newPage();
  await other.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      },
    });
  });
  await mockApi(other, { language: 'en', ...typed(PHONES) });
  await other.goto(`/${SLUG}/products/new`);
  await stock(other).getByLabel('Opening stock').fill('1');
  await stock(other).getByRole('button', { name: 'Opening serials' }).click();
  const blocked = sheet(other, 'Opening serials');
  await expect(blocked).toContainText('The camera is blocked for this site.');
  await expect(blocked.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expectAccessible(other);
});
