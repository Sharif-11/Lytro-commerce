import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts } from './support/products';
import { creamShop, phoneShop, SAMPLE_IMEIS as IMEI } from './support/stock';

// TENANT-DASHBOARD-DESIGN §7.4, Slice 11.7c step 3 (the prototype's `product`, `pf-edit-*`, the Stock sheets, Part 18):
// a saved product's Stock card -- what it can sell, waits to ship and holds -- with Add stock, Stock history, Batches
// with Write off, and IMEI / serials with Add serials, Fix and Remove, each sheet picking its variant where the product
// has several; and who may see or change it. Each test runs on a phone and on a desktop.

async function open(page: Page, id: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products/${id}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

function card(page: Page) {
  return page.getByRole('main').getByRole('region', { name: 'Stock', exact: true });
}

function sheet(page: Page, name: string | RegExp) {
  return page.getByRole('dialog', { name });
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

/** Picks a variant in a sheet's "Product · variant" field. */
async function pick(page: Page, within: string, variant: string): Promise<void> {
  await sheet(page, within)
    .getByRole('button', { name: /^Product · variant/ })
    .click();
  await sheet(page, 'Pick a variant')
    .getByRole('radio', { name: new RegExp(`^${variant}`) })
    .click();
}

test('the T-shirt: what it can sell and holds; Add stock picks its variant, then the card counts it', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await expect(card(page)).toContainText('Can sell54');
  await expect(card(page)).toContainText('Waiting to ship0');
  await expect(card(page)).toContainText('On hand54');
  await card(page).getByRole('button', { name: 'Add stock' }).click();
  const add = sheet(page, 'Add stock');
  await expect(add.getByRole('button', { name: /^Product · variant/ })).toContainText(
    'Cotton T-shirt · S · Black',
  );
  await pick(page, 'Add stock', 'M · Black');
  await expect(add.getByRole('button', { name: /^Product · variant/ })).toContainText('M · Black');
  await add.getByLabel('Quantity').fill('5');
  await add.getByLabel('Unit cost (optional)').fill('300');
  await add.getByLabel('Supplier (optional)').fill('Karim Garments');
  await expect(add).toContainText('On hand goes 10 → 15');
  await expectAccessible(page);
  await add.getByRole('button', { name: 'Add 5' }).click();
  await expect(add).toBeHidden();
  expect(sent(log, 'POST', '/products/p-1/variants/p-1-v3/stock-additions')).toEqual([
    { quantity: 5, unitCost: 300, supplierName: 'Karim Garments' },
  ]);
  await expect(card(page)).toContainText('On hand59');
});

test("Stock history: a variant's movements, picked, newest first, with Show earlier", async ({
  page,
}) => {
  const products = drawnProducts();
  const shirt = products.products[0];
  if (shirt) {
    shirt.history = {
      'p-1-v3': Array.from({ length: 25 }, (_, index) => ({
        id: 100 - index,
        delta: index === 24 ? '20' : '-1',
        onHandAfter: String(10 + index),
        reason: index === 24 ? 'initial' : 'sale',
        note: index === 0 ? 'check #12' : null,
        actor: { userId: 'u-1', name: 'Rumana' },
        createdAt: new Date(Date.now() - (index + 2) * 24 * 60 * 60 * 1000).toISOString(),
      })),
    };
  }
  await open(page, 'p-1', { products });
  await card(page).getByRole('button', { name: 'Stock history' }).click();
  const history = sheet(page, 'Stock history');
  await expect(history).toContainText('+6 opening stock');
  await pick(page, 'Stock history', 'M · Black');
  await expect(history.getByText('−1 sold').first()).toBeVisible();
  await expect(history).toContainText('Rumana · 10 after · check #12');
  await expect(history.getByText('+20 opening stock')).toHaveCount(0);
  await expectAccessible(page);
  await history.getByRole('button', { name: 'Show earlier' }).click();
  await expect(history.getByText('+20 opening stock')).toBeVisible();
  await expect(history.getByRole('button', { name: 'Show earlier' })).toHaveCount(0);
});

test('Batches: fine, expiring and expired; an expired one written off, said with what it cost', async ({
  page,
}) => {
  const log = await open(page, 'p-fc', { products: creamShop() });
  await expect(card(page)).toContainText('On hand39');
  await card(page).getByRole('button', { name: 'Batches' }).click();
  const batches = sheet(page, 'Batches');
  const rows = batches.getByRole('list', { name: 'Batches' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('FC-0702');
  await expect(rows.nth(0)).toContainText('Expired');
  await expect(rows.nth(1)).toContainText('13 days left');
  await expect(rows.nth(2)).toContainText('Fine');
  // INV-13: only an expired batch is written off here.
  await expect(batches.getByRole('button', { name: 'Write off' })).toHaveCount(1);
  await expectAccessible(page);
  await rows.nth(0).getByRole('button', { name: 'Write off' }).click();
  const step = sheet(page, 'Write off a batch');
  await expect(step).toContainText('FC-0702 · exp ');
  await expect(step).toContainText('The loss is recorded at average cost: ৳360');
  await step.getByRole('button', { name: 'Write off 3' }).click();
  await expect(
    sheet(page, 'Batches').getByRole('list', { name: 'Batches' }).getByRole('listitem'),
  ).toHaveCount(2);
  expect(sent(log, 'POST', '/products/p-fc/batches/b-1/write-off')).toHaveLength(1);
  await sheet(page, 'Batches').getByRole('button', { name: 'Close' }).click();
  await expect(card(page)).toContainText('On hand36');
});

test("a phone's serials: the missing ones added from the card, one fixed, one removed", async ({
  page,
}) => {
  const log = await open(page, 'p-ph', { products: phoneShop([IMEI[3] ?? '']) });
  // The table shows each variant's serials held of what it holds, where others show SKU.
  const table = page
    .getByRole('main')
    .getByRole('region', { name: 'Options and variants' })
    .getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Variant',
    'PriceFill all',
    'Can sell',
    'IMEI / serials',
  ]);
  await expect(table.getByRole('button', { name: 'IMEI / serials of 128 GB' })).toHaveText('2 / 3');
  await expect(card(page)).toContainText('Serials: 3 held, 2 missing');
  // With options, the table opens a variant's serials; the card has no button for them.
  await expect(card(page).getByRole('button', { name: 'IMEI / serials' })).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Add the missing ones' }).click();
  const missing = sheet(page, 'Add serials');
  await expect(missing).toContainText('Galaxy A16 · 128 GB · 1 units still have no serial');
  await missing.getByRole('tab', { name: 'Type' }).click();
  await missing.getByLabel('Type an IMEI').fill(IMEI[2] ?? '');
  await missing.getByLabel('Type an IMEI').press('Enter');
  await expect(missing).toContainText('Every unit has a serial now.');
  await missing.getByRole('button', { name: 'Add 1' }).click();
  await expect(missing).toBeHidden();
  expect(sent(log, 'POST', '/products/p-ph/variants/p-ph-v1/serials')).toEqual([
    { serials: [IMEI[2]] },
  ]);
  await expect(card(page)).toContainText('Serials: 4 held, 1 missing');

  await table.getByRole('button', { name: 'IMEI / serials of 128 GB' }).click();
  const serials = sheet(page, 'IMEI / serials');
  await expect(serials.getByRole('button', { name: /^In stock/ })).toContainText('3');
  await expect(serials.getByRole('button', { name: /^Sold/ })).toContainText('1');
  // A sold unit's serial is history: no Fix.
  await serials.getByRole('button', { name: /^Sold/ }).click();
  await expect(serials.getByText('356789104567936')).toBeVisible();
  await expect(serials.getByRole('button', { name: /^Fix/ })).toHaveCount(0);
  await serials.getByRole('button', { name: /^In stock/ }).click();
  await expectAccessible(page);
  await serials.getByRole('button', { name: `Fix ${IMEI[0] ?? ''}` }).click();
  const fix = sheet(page, 'Fix a serial');
  await fix.getByLabel('New serial').fill(IMEI[3] ?? '');
  await fix.getByRole('button', { name: 'Save' }).click();
  await expect(fix.getByText('This IMEI is already in this variant')).toBeVisible();
  await fix.getByLabel('New serial').fill('356789104567951');
  await fix.getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page, 'IMEI / serials').getByText('356789104567951')).toBeVisible();
  expect(sent(log, 'PATCH', '/products/p-ph/serials/sn-1').at(-1)).toEqual({
    serial: '356789104567951',
  });
  await sheet(page, 'IMEI / serials')
    .getByRole('button', { name: `Fix ${IMEI[1] ?? ''}` })
    .click();
  await sheet(page, 'Fix a serial').getByRole('button', { name: 'Remove the serial' }).click();
  await expect(sheet(page, 'IMEI / serials').getByText(IMEI[1] ?? '')).toHaveCount(0);
  expect(
    log.calls.filter(
      (call) => call.method === 'DELETE' && call.path === '/products/p-ph/serials/sn-2',
    ),
  ).toHaveLength(1);
});

test("Add stock on a phone takes the arriving units' IMEIs, fewer leaving the rest for later", async ({
  page,
}) => {
  const log = await open(page, 'p-ph', { products: phoneShop() });
  await card(page).getByRole('button', { name: 'Add stock' }).click();
  const add = sheet(page, 'Add stock');
  await pick(page, 'Add stock', '256 GB');
  await add.getByLabel('Quantity').fill('3');
  await add.getByRole('button', { name: /^IMEI \/ serials/ }).click();
  const serials = sheet(page, 'IMEI / serials');
  await expect(serials).toContainText('Galaxy A16 · 256 GB · 3 units');
  await serials.getByRole('tab', { name: 'Type' }).click();
  for (const code of [IMEI[2] ?? '', IMEI[3] ?? '']) {
    await serials.getByLabel('Type an IMEI').fill(code);
    await serials.getByLabel('Type an IMEI').press('Enter');
  }
  await serials.getByRole('button', { name: 'Done' }).click();
  await expect(add.getByRole('button', { name: /^IMEI \/ serials/ })).toContainText(
    '2 of 3 entered · the rest can come later',
  );
  await expect(add).toContainText('On hand goes 2 → 5, the IMEIs saved with it');
  await add.getByRole('button', { name: 'Add 3' }).click();
  await expect(add).toBeHidden();
  expect(sent(log, 'POST', '/products/p-ph/variants/p-ph-v2/stock-additions')).toEqual([
    { quantity: 3, serials: [IMEI[2], IMEI[3]] },
  ]);
  await expect(card(page)).toContainText('Serials: 5 held, 3 missing');
});

test('Add stock on a batch product takes its batch, never one already expired', async ({
  page,
}) => {
  const log = await open(page, 'p-fc', { products: creamShop() });
  await card(page).getByRole('button', { name: 'Add stock' }).click();
  const add = sheet(page, 'Add stock');
  // One variant: no picker.
  await expect(add.getByRole('button', { name: /^Product · variant/ })).toHaveCount(0);
  await add.getByLabel('Quantity').fill('24');
  await add.getByLabel('Batch code (optional)').fill('FC-1203');
  await add.getByLabel('Expiry date (optional)').fill('2020-01-31');
  await expect(add.getByText('That date has passed; give today or a later one.')).toBeVisible();
  await expect(add.getByRole('button', { name: 'Add 24' })).toBeDisabled();
  await add.getByLabel('Expiry date (optional)').fill('2099-12-31');
  await add.getByRole('button', { name: 'Add 24' }).click();
  await expect(add).toBeHidden();
  expect(sent(log, 'POST', '/products/p-fc/variants/p-fc-v1/stock-additions')).toEqual([
    { quantity: 24, batch: { batchCode: 'FC-1203', expiresOn: '2099-12-31' } },
  ]);
  await expect(card(page)).toContainText('On hand63');
});

test('without stock to change the card only shows; without stock to see there is none', async ({
  page,
}) => {
  await open(page, 'p-1', {
    isOwner: false,
    permissions: ['products:read', 'products:manage', 'inventory:read'],
  });
  await expect(card(page)).toContainText('On hand54');
  await expect(card(page).getByRole('button', { name: 'Add stock' })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Stock history' })).toBeVisible();
  await open(page, 'p-1', { isOwner: false, permissions: ['products:read', 'products:manage'] });
  await expect(page.getByRole('main').getByRole('heading', { name: 'Basics' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
