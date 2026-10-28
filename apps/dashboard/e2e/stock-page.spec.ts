import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import type { ProductsFixture } from './support/products';
import { creamShop, galaxyShop, stockShop } from './support/stock';

// TENANT-DASHBOARD-DESIGN §7.7, Slice 11.9 (the prototype's `stock` and Part 20, design v3.7): the Stock page -- the
// figures for someone who may manage stock, the products wanting seeing to in full and the rest folded, the segments
// and the search -- a row's own sheet, Edit stock with its reason, batch and IMEIs, Average cost, and Add stock picking
// its product first from the header or the + menu; someone who may only look sees the rows alone. Each test runs on a
// phone and on a desktop.

async function open(page: Page, state: ShopState = {}, path = '/stock'): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: stockShop(), ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const products = (page: Page) => main(page).getByRole('heading', { level: 2 });

/** A row of the page, by its own name and stock chip ("M Low stock"). */
const row = (page: Page, name: string) =>
  main(page)
    .getByRole('button', { name: new RegExp(`^${name} (In|Low|Out of) stock`) })
    .first();

function sent(log: ApiLog, method: string, path: string): Record<string, unknown>[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body as Record<string, unknown>);
}

/** One product of a fixture alone, so its row is the page's only one. */
function only(fixture: ProductsFixture, id: string): ProductsFixture {
  return { ...fixture, products: fixture.products.filter((each) => each.id === id) };
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

test('the figures, the products wanting seeing to first, the rest folded into "Stock is fine"', async ({
  page,
}) => {
  await open(page);
  const figures = main(page).getByRole('group', { name: 'Stock figures' });
  await expect(figures).toContainText('Stock value৳84,350At average cost, now');
  await expect(figures).toContainText('Cost of goods sold৳21,680This month');
  await expect(figures).toContainText('Losses৳1,890Damaged 2 · lost 1');
  await expect(figures).toContainText('Expiring0No batches in this shop');
  // Out first, then low or with a variant low; each with its average cost.
  await expect(products(page)).toHaveText(['Kids frock', 'Denim jacket', 'Cotton T-shirt']);
  await expect(main(page)).toContainText('Avg cost ৳1,240');
  // The T-shirt: its first two, XXL Blue because it is low, the other seven behind "+7 more variants".
  await expect(row(page, 'M · Black')).toContainText('Can sell12Waiting to ship2Coming20On hand14');
  await expect(row(page, 'XXL · Blue')).toBeVisible();
  await expect(row(page, 'L · Black')).toHaveCount(0);
  await main(page).getByRole('button', { name: '+7 more variants' }).click();
  await expect(row(page, 'L · Black')).toBeVisible();
  // The fine ones fold into one row, and open in place with the made-to-order line.
  const fine = main(page).getByRole('button', { name: /Stock is fine$/ });
  await expect(fine).toContainText('Silk saree, Hoodie, Scarf, Custom panjabi');
  await expectAccessible(page);
  await fine.click();
  await expect(products(page)).toHaveText([
    'Kids frock',
    'Denim jacket',
    'Cotton T-shirt',
    'Silk saree',
    'Hoodie',
    'Scarf',
    'Custom panjabi',
  ]);
  await expect(main(page)).toContainText('Made to orderMade when ordered; no stock is counted');
  await expect(row(page, '—')).toContainText('Can sell6Waiting to ship1On hand7');
  await main(page).getByRole('button', { name: 'Show less' }).click();
  await expect(products(page)).toHaveCount(3);
});

test('the segments are counted and picked, and a search shows what it finds in full', async ({
  page,
}) => {
  await open(page);
  const chips = main(page).getByRole('group').filter({ hasText: 'All' });
  await expect(chips.getByRole('button', { name: 'Out of stock' })).toContainText('1');
  await chips.getByRole('button', { name: /^Out of stock/ }).click();
  await expect(page).toHaveURL(/seg=out/);
  await expect(products(page)).toHaveText(['Kids frock']);
  await chips.getByRole('button', { name: /^Low stock/ }).click();
  await expect(main(page)).toContainText('Nothing is low on stock.');
  await chips.getByRole('button', { name: /^All/ }).click();
  await main(page).getByRole('searchbox', { name: 'Search products' }).fill('scarf');
  await expect(page).toHaveURL(/q=scarf/);
  // A fine product found is shown in full, not folded.
  await expect(products(page)).toHaveText(['Scarf']);
  await expect(row(page, 'Red')).toBeVisible();
  await main(page).getByRole('searchbox', { name: 'Search products' }).fill('nothing like it');
  await expect(main(page)).toContainText('No products match.');
  await main(page).getByRole('button', { name: 'Show all products' }).click();
  await expect(products(page)).toHaveCount(3);
});

test("a row's own sheet: what it holds, its last change and its cost, no batches where none are kept", async ({
  page,
}) => {
  await open(page);
  await row(page, 'M').click();
  const own = sheet(page, 'Denim jacket · M');
  await expect(own).toContainText('5 on hand · 4 can sell');
  await expect(own.getByRole('button', { name: /^Stock history/ })).toContainText('Last change:');
  await expect(own.getByRole('button', { name: /^Average cost/ })).toContainText('৳1,240 a unit');
  await expect(own.getByRole('button', { name: /^Batches/ })).toHaveCount(0);
  await expectAccessible(page);
  await own.getByRole('button', { name: /^Stock history/ }).click();
  await expect(sheet(page, 'Stock history')).toContainText('+5 opening stock');
});

test("a batch-kept row's sheet says its batches and the earliest expiry", async ({ page }) => {
  await open(page, { products: only(creamShop(), 'p-fc') }, '/stock?q=cream');
  await row(page, '—').click();
  const cream = sheet(page, 'Face cream 50 ml');
  await expect(cream.getByRole('button', { name: /^Batches/ })).toContainText(
    '3 batches · earliest expiry',
  );
  await cream.getByRole('button', { name: /^Batches/ }).click();
  await expect(sheet(page, 'Batches')).toContainText('FC-0921');
});

test("a serial-numbered row's sheet says how many units still have no IMEI", async ({ page }) => {
  await open(page, { products: galaxyShop('en', 2) });
  await row(page, '128 GB · Black').click();
  const phone = sheet(page, 'Galaxy A15 · 128 GB · Black');
  await expect(phone.getByRole('button', { name: /^Average cost/ })).toContainText('Not set yet');
  await expect(phone.getByRole('button', { name: /^IMEI \/ serials/ })).toContainText(
    '5 held · 2 without an IMEI',
  );
});

test('Edit stock: the number now held, a reason that fits the change, a note; recorded as one change', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Edit: Denim jacket · M' }).click();
  const edit = sheet(page, 'Edit stock');
  await expect(edit).toContainText('Denim jacket · M · On hand 5');
  await expect(edit.getByRole('button', { name: 'Save' })).toBeDisabled();
  await edit.getByRole('button', { name: 'One fewer' }).click();
  await expect(edit.getByLabel('How many are there now?')).toHaveValue('4');
  await expect(edit).toContainText('Recorded as −1 and shown in the history.');
  // New stock only arrives: it cannot be why a number fell.
  await expect(edit.getByRole('button', { name: 'New stock arrived' })).toBeDisabled();
  await edit.getByRole('button', { name: 'Damaged or lost' }).click();
  await edit.getByLabel('Note').fill('got wet in the rain');
  await expectAccessible(page);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  expect(sent(log, 'PUT', '/products/p-2/variants/p-2-v2/stock')).toEqual([
    { onHand: 4, reason: 'damaged_or_lost', note: 'got wet in the rain' },
  ]);
  await expect(row(page, 'M')).toContainText('On hand4');
});

test('Edit stock on a product kept in batches names the batch a fall leaves and a rise joins', async ({
  page,
}) => {
  const log = await open(page, { products: only(creamShop(), 'p-fc') }, '/stock?q=cream');
  const edit = sheet(page, 'Edit stock');
  const path = '/products/p-fc/variants/p-fc-v1/stock';
  await main(page).getByRole('button', { name: 'Edit: Face cream 50 ml' }).click();
  await edit.getByLabel('How many are there now?').fill('37');
  // The soonest to expire is marked, and left as it is nothing is named.
  const leaves = edit.getByRole('radiogroup', { name: 'Which batch it leaves' });
  await expect(leaves.getByRole('radio', { name: /^FC-0702/ })).toBeChecked();
  await leaves.getByRole('radio', { name: /^FC-0921/ }).click();
  await edit.getByRole('button', { name: 'Damaged or lost' }).click();
  await expectAccessible(page);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  expect(sent(log, 'PUT', path)).toEqual([
    { onHand: 37, reason: 'damaged_or_lost', batchId: 'b-2' },
  ]);

  await main(page).getByRole('button', { name: 'Edit: Face cream 50 ml' }).click();
  await edit.getByLabel('How many are there now?').fill('45');
  const joins = edit.getByRole('radiogroup', { name: 'Which batch it joins' });
  await expect(joins.getByRole('radio', { name: 'A new batch' })).toBeChecked();
  await edit.getByRole('button', { name: 'New stock arrived' }).click();
  await edit.getByLabel('Batch code (optional)').fill('FC-1209');
  await edit.getByLabel('Expiry date (optional)').fill('2030-06-30');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  expect(sent(log, 'PUT', path)[1]).toEqual({
    onHand: 45,
    reason: 'new_stock',
    batch: { batchCode: 'FC-1209', expiresOn: '2030-06-30' },
  });
});

test('Edit stock on a serial-numbered product names the IMEIs leaving, all but units without one', async ({
  page,
}) => {
  const log = await open(page, { products: galaxyShop('en') });
  await main(page).getByRole('button', { name: 'Edit: Galaxy A15 · 128 GB · Black' }).click();
  const edit = sheet(page, 'Edit stock');
  await edit.getByLabel('How many are there now?').fill('3');
  const leaving = edit.getByRole('group', { name: 'The IMEIs leaving · pick 2' });
  await expect(edit.getByRole('button', { name: 'Save' })).toBeDisabled();
  await leaving.getByRole('checkbox', { name: '357812094561242' }).check();
  await leaving.getByRole('checkbox', { name: '357812094561267' }).check();
  // Two leave, so a third cannot be ticked.
  await expect(leaving.getByRole('checkbox', { name: '357812094561234' })).toBeDisabled();
  await expectAccessible(page);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  expect(sent(log, 'PUT', '/products/p-ga/variants/p-ga-v1/stock')).toEqual([
    { onHand: 3, reason: 'other', serials: ['357812094561242', '357812094561267'] },
  ]);
});

test('units that never had an IMEI may leave unnamed', async ({ page }) => {
  await open(page, { products: galaxyShop('en', 2) });
  await main(page).getByRole('button', { name: 'Edit: Galaxy A15 · 128 GB · Black' }).click();
  const edit = sheet(page, 'Edit stock');
  await edit.getByLabel('How many are there now?').fill('3');
  await expect(edit.getByRole('group', { name: /^The IMEIs leaving/ })).toHaveCount(0);
  await expect(edit.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('Average cost is typed by hand, and cleared back to unknown', async ({ page }) => {
  const log = await open(page);
  await row(page, 'M').click();
  await sheet(page, 'Denim jacket · M')
    .getByRole('button', { name: /^Average cost/ })
    .click();
  const cost = sheet(page, 'Average cost');
  await expect(cost.getByLabel('Average cost')).toHaveValue('1,240');
  await cost.getByLabel('Average cost').fill('1,300.50');
  await expectAccessible(page);
  await cost.getByRole('button', { name: 'Save' }).click();
  await expect(cost).toBeHidden();
  await row(page, 'M').click();
  await sheet(page, 'Denim jacket · M')
    .getByRole('button', { name: /^Average cost/ })
    .click();
  await expect(cost.getByLabel('Average cost')).toHaveValue('1,300.5');
  await cost.getByLabel('Average cost').fill('');
  await cost.getByRole('button', { name: 'Save' }).click();
  await expect(cost).toBeHidden();
  expect(sent(log, 'PUT', '/products/p-2/variants/p-2-v2/cost')).toEqual([
    { avgCost: 1300.5 },
    { avgCost: null },
  ]);
});

test('Add stock from the header or the + menu picks its product first, made to order left out', async ({
  page,
}) => {
  const log = await open(page);
  await page.getByRole('button', { name: 'Add stock', exact: true }).click();
  const pick = sheet(page, 'Add stock');
  await expect(pick).toContainText('Which product arrived?');
  await expect(pick.getByRole('button', { name: /^Denim jacket/ })).toContainText(
    '4 variants · 29 on hand',
  );
  await expect(pick.getByRole('button', { name: /^Custom panjabi/ })).toHaveCount(0);
  await expectAccessible(page);
  await pick.getByRole('searchbox', { name: 'Search products' }).fill('saree');
  await expect(pick.getByRole('button', { name: /^Denim jacket/ })).toHaveCount(0);
  await pick.getByRole('button', { name: /^Silk saree/ }).click();
  const add = page.getByRole('dialog', { name: 'Add stock' }).last();
  await add.getByLabel('Quantity').fill('3');
  await add.getByRole('button', { name: 'Add 3' }).click();
  await expect(add).toBeHidden();
  expect(sent(log, 'POST', '/products/p-3/variants/p-3-v1/stock-additions')).toEqual([
    { quantity: 3 },
  ]);

  // The + menu's Add stock opens the same pick on the Stock page.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add stock' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/stock$`));
  await expect(sheet(page, 'Add stock')).toContainText('Which product arrived?');
});

test('someone who may only look sees the rows alone: no figures, buttons or costs', async ({
  page,
}) => {
  const log = await open(page, {
    isOwner: false,
    permissions: ['inventory:read', 'products:read'],
  });
  await expect(products(page).first()).toBeVisible();
  await expect(main(page).getByRole('group', { name: 'Stock figures' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add stock', exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Edit:/ })).toHaveCount(0);
  await expect(main(page)).not.toContainText('Avg cost');
  await row(page, 'M').click();
  await expect(
    sheet(page, 'Denim jacket · M').getByRole('button', { name: /^Average cost/ }),
  ).toHaveCount(0);
  await expectAccessible(page);
  expect(log.calls.some((call) => call.path === '/inventory/figures')).toBe(false);
});

test("each variant is named by its options' ids, whatever order a read lists them in", async ({
  page,
}) => {
  // The stock reads list a variant's options by attribute; the product's own order is size, then colour.
  const fixture = stockShop();
  const shirt = fixture.products.find((each) => each.id === 'p-1');
  for (const each of shirt?.matrix?.rows ?? []) each.optionIds = [...each.optionIds].reverse();
  await open(page, { products: fixture });
  await expect(row(page, 'S · Black')).toBeVisible();
  await expect(row(page, 'XXL · Blue')).toBeVisible();
});
