import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import type { ProductsFixture } from './support/products';
import type { PurchaseFixture } from './support/purchases';
import { creamShop, galaxyShop, SAMPLE_IMEIS, stockShop } from './support/stock';

// TENANT-DASHBOARD-DESIGN §7.21, Slice 11.10 (the prototype's purchasing screens and Part 21; PUR-01 to PUR-10): Open
// with what is coming, Drafts and All; Order from supplier with the supplier typed and a product's variants ticked at
// once; a draft and a placed purchase changed; It arrived, item by item; Cancel, Close short and Delete draft; the
// deliveries; Suppliers with Show archived; and a variant's purchases from its Stock row. Each test runs on a phone and
// on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', products: stockShop(), ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const rows = (page: Page) => main(page).getByRole('link', { name: /^(PO-\d{4}|Draft)/ });

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

/** The face cream kept in batches and the Galaxy kept by IMEI, ordered from Rahim Traders and nothing in yet. */
function keptOrder(): ProductsFixture {
  const now = new Date().toISOString();
  const purchase: PurchaseFixture = {
    id: 'po-10',
    number: 10,
    status: 'ordered',
    supplierId: 's-rahim',
    expectedOn: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    orderedAt: now,
    closeReason: null,
    items: [
      { id: 'po-10-fc', variantId: 'p-fc-v1', ordered: 24, received: 0, unitCost: '310.00' },
      { id: 'po-10-gx', variantId: galaxyVariant(), ordered: 5, received: 0, unitCost: null },
    ],
    receipts: [],
  };
  return {
    ...creamShop(),
    products: [
      ...creamShop().products.filter((each) => each.id === 'p-fc'),
      ...galaxyShop().products,
    ],
    purchasing: {
      suppliers: [
        { id: 's-rahim', name: ['রহিম ট্রেডার্স', 'Rahim Traders'], phone: null, archived: false },
      ],
      purchases: [purchase],
    },
  };
}

function galaxyVariant(): string {
  const product = galaxyShop().products[0];
  return product?.matrix?.rows[0]?.id ?? '';
}

test('Open holds what is on order and what is coming; Drafts and All the rest, each with its number and status', async ({
  page,
}) => {
  await open(page, '/purchases');
  await expect(main(page)).toContainText('Coming');
  await expect(main(page)).toContainText('70 pcs in 2 purchases');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('PO-0007Rahim Traders');
  await expect(rows(page).nth(0)).toContainText('50 pcs · 3 items');
  await expect(rows(page).nth(0)).toContainText('Expected on');
  await expect(rows(page).nth(0)).toContainText('Ordered');
  await expect(rows(page).nth(1)).toContainText('PO-0006Karim Garments');
  await expect(rows(page).nth(1)).toContainText('Partly received');
  const chips = main(page).getByRole('group');
  await expect(chips.getByRole('button', { name: /^Drafts/ })).toContainText('1');
  await expect(chips.getByRole('link', { name: /^Suppliers/ })).toContainText('3');
  await expectAccessible(page);

  await chips.getByRole('button', { name: /^All/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/purchases?seg=all`);
  await expect(rows(page)).toHaveCount(6);
  // Add stock's arrival is an ordinary received purchase, with no supplier (agreed in the 11.10 read).
  await expect(rows(page).nth(0)).toContainText('PO-0008No supplier');
  await expect(rows(page).nth(0)).toContainText('Received');
  await expect(rows(page).nth(2)).toContainText('DraftAlam Textile');
  await expect(rows(page).nth(5)).toContainText('Closed short');

  await chips.getByRole('button', { name: /^Drafts/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().click();
  await expect(page).toHaveURL(`/${SLUG}/purchases/po-draft`);
});

test('Order from supplier: a supplier found as typed, several variants ticked at once, placed with its number', async ({
  page,
}) => {
  const log = await open(page, '/purchases');
  await main(page).getByRole('button', { name: 'Order from supplier' }).click();
  const order = sheet(page, 'Order from supplier');
  await order.getByLabel('Supplier').fill('rah');
  await expect(order.getByRole('button', { name: '"rah" as a new supplier' })).toBeVisible();
  // A name the shop has already, in any case, is found rather than offered as new.
  await order.getByLabel('Supplier').fill('rahim traders');
  await expect(order.getByRole('button', { name: /as a new supplier$/ })).toHaveCount(0);
  await order.getByRole('button', { name: /^Rahim Traders/ }).click();
  await expect(order.getByLabel('Supplier')).toHaveValue('Rahim Traders');
  await expect(order.getByRole('button', { name: 'Place with supplier' })).toBeDisabled();

  await order.getByRole('button', { name: 'Add item' }).click();
  const add = sheet(page, 'Add item');
  await expect(add).toContainText('Which product are you ordering?');
  await add.getByRole('button', { name: /^Cotton T-shirt/ }).click();
  await expect(add).toContainText('Cotton T-shirt · Which variants?');
  await add.getByRole('checkbox', { name: /^L · Black/ }).check();
  await add.getByRole('checkbox', { name: /^XL · Black/ }).check();
  await expectAccessible(page);
  await add.getByRole('button', { name: 'Add 2 items' }).click();

  await order.getByLabel('Quantity of Cotton T-shirt · L · Black').fill('12');
  await order.getByLabel('Unit cost of Cotton T-shirt · L · Black').fill('275');
  await order.getByLabel('Quantity of Cotton T-shirt · XL · Black').fill('6');
  await expectAccessible(page);
  await order.getByRole('button', { name: 'Place with supplier' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/purchases/po-new-`));
  expect(sent(log, 'POST', '/purchase-orders')).toEqual([
    {
      supplierId: 's-rahim',
      items: [
        { variantId: 'p-1-v3', quantity: 12, unitCost: 275 },
        { variantId: 'p-1-v4', quantity: 6, unitCost: null },
      ],
    },
  ]);
  expect(log.calls.some((call) => call.method === 'POST' && /\/place$/.test(call.path))).toBe(true);
  await expect(main(page)).toContainText('Ordered');
  await expect(main(page)).toContainText('Total, at known costs: ৳3,300 · 1 item without a cost');
});

test('a supplier typed new is sent as typed, and Save draft leaves it among the drafts', async ({
  page,
}) => {
  const log = await open(page, '/purchases');
  await main(page).getByRole('button', { name: 'Order from supplier' }).click();
  const order = sheet(page, 'Order from supplier');
  await order.getByLabel('Supplier').fill('Nur Fabrics');
  await order.getByRole('button', { name: '"Nur Fabrics" as a new supplier' }).click();
  await order.getByLabel('Notes').fill('Ask for the blue roll');
  await order.getByRole('button', { name: 'Add item' }).click();
  // A product with one variant joins at once.
  await sheet(page, 'Add item')
    .getByRole('button', { name: /^Silk saree/ })
    .click();
  await order.getByLabel('Quantity of Silk saree').fill('4');
  await order.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(`/${SLUG}/purchases?seg=drafts`);
  expect(sent(log, 'POST', '/purchase-orders')).toEqual([
    {
      supplierName: 'Nur Fabrics',
      notes: 'Ask for the blue roll',
      items: [{ variantId: 'p-3-v1', quantity: 4, unitCost: null }],
    },
  ]);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('DraftNur Fabrics');
});

test('a draft: everything changes, Save draft sends it, Place numbers it; another is deleted after asking', async ({
  page,
}) => {
  const log = await open(page, '/purchases/po-draft');
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible();
  await expect(main(page).getByLabel('Supplier')).toHaveValue('Alam Textile');
  await expect(main(page)).toContainText('Total, at known costs: ৳9,500');
  await main(page).getByLabel('Quantity of Scarf · Red').fill('40');
  await expect(main(page)).toContainText('Total, at known costs: ৳7,600');
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(main(page).getByRole('button', { name: 'Save draft' })).toBeDisabled();
  expect(sent(log, 'PATCH', '/purchase-orders/po-draft')).toEqual([
    { items: [{ variantId: 'p-6-v1', quantity: 40, unitCost: 190 }] },
  ]);
  await main(page).getByRole('button', { name: 'Place with supplier' }).click();
  await expect(main(page).getByText('Ordered', { exact: true })).toBeVisible();
  expect(log.calls.filter((call) => call.path === '/purchase-orders/po-draft/place')).toHaveLength(
    1,
  );

  await open(page, '/purchases/po-draft');
  await main(page).getByRole('button', { name: 'Delete draft' }).click();
  const ask = sheet(page, 'Delete this draft?');
  await expect(ask).toContainText('It was never placed, so it goes for good.');
  await ask.getByRole('button', { name: 'Delete draft' }).click();
  await expect(page).toHaveURL(`/${SLUG}/purchases?seg=drafts`);
  await expect(main(page)).toContainText('No drafts.');
});

test('a placed purchase changes its items until the first delivery, and is cancelled while nothing arrived', async ({
  page,
}) => {
  const log = await open(page, '/purchases/po-7');
  // Its number heads the page on a phone and the header from 1024 px (design v3.10).
  await expect(page.getByRole('heading', { level: 1, name: 'PO-0007' })).toBeVisible();
  await expect(main(page)).toContainText(
    'Until the first delivery the supplier and the items can change.',
  );
  await main(page).getByRole('button', { name: 'Remove Cotton T-shirt · M · Blue' }).click();
  await expect(main(page)).toContainText('Total, at known costs: ৳11,200');
  await main(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(main(page).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(sent(log, 'PATCH', '/purchase-orders/po-7')).toEqual([
    {
      items: [
        { variantId: 'p-1-v2', quantity: 20, unitCost: 280 },
        { variantId: 'p-1-v3', quantity: 20, unitCost: 280 },
      ],
    },
  ]);
  await main(page).getByRole('button', { name: 'Cancel purchase' }).click();
  const ask = sheet(page, 'Cancel this purchase?');
  await expect(ask).toContainText('Its number is never reused.');
  await ask.getByRole('button', { name: 'Cancel purchase' }).click();
  await expect(main(page)).toContainText('nothing had arrived');
  await expect(main(page).getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'It arrived' })).toHaveCount(0);
});

test('It arrived: a rejection takes its reason, the rest is accepted; the delivery opens; Close short keeps why', async ({
  page,
}) => {
  const log = await open(page, '/purchases/po-7');
  await main(page).getByRole('button', { name: 'It arrived' }).click();
  const arrived = sheet(page, 'It arrived');
  await expect(arrived).toContainText('PO-0007 · Rahim Traders');
  const first = arrived
    .locator('div.rounded-card')
    .filter({ hasText: 'Cotton T-shirt · M · Black' });
  await expect(first.getByLabel('Accepted')).toHaveValue('20');
  await first.getByLabel('Accepted').fill('18');
  await first.getByLabel('Rejected').fill('2');
  await expect(arrived.getByRole('button', { name: 'Record delivery' })).toBeDisabled();
  await first.getByLabel('Reject reason').fill('torn seams');
  const third = arrived
    .locator('div.rounded-card')
    .filter({ hasText: 'Cotton T-shirt · M · Blue' });
  await third.getByLabel('Accepted').fill('0');
  await expectAccessible(page);
  await arrived.getByRole('button', { name: 'Record delivery' }).click();
  await expect(arrived).toBeHidden();
  expect(sent(log, 'POST', '/purchase-orders/po-7/receipts')).toEqual([
    {
      items: [
        {
          itemId: 'po-7-i1',
          accepted: 18,
          rejected: 2,
          rejectReason: 'torn seams',
          unitCost: 280,
        },
        { itemId: 'po-7-i2', accepted: 20, unitCost: 280 },
      ],
    },
  ]);
  await expect(main(page).getByText('Partly received', { exact: true })).toBeVisible();
  // After the first delivery the supplier and the items are fixed; the day and notes still change.
  await expect(main(page).getByRole('button', { name: /^Remove / })).toHaveCount(0);
  await expect(main(page).getByLabel('Supplier')).not.toBeEditable();
  await expect(main(page).getByLabel('Notes')).toBeEditable();
  const delivery = main(page).getByRole('button', { name: /^38 pcs accepted · 2 pcs rejected/ });
  await expect(delivery).toContainText('Rumana');
  await delivery.click();
  const one = sheet(page, /^Delivery, /);
  await expect(one).toContainText('Taken byRumana');
  await expect(one).toContainText('18 accepted · 2 rejected: torn seams');
  await expect(one).toContainText('৳280 a unit');
  await expectAccessible(page);
  await one.getByRole('button', { name: 'Close' }).click();

  // Once anything was delivered, the purchase closes short instead of cancelling.
  await expect(main(page).getByRole('button', { name: 'Cancel purchase' })).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Close short' }).click();
  const close = sheet(page, 'Close this purchase short?');
  await expect(close).toContainText('The 12 pcs outstanding are dropped as not coming');
  await expect(close.getByRole('button', { name: 'Close short' })).toBeDisabled();
  await close.getByLabel('Reason').fill('The rest is out of stock');
  await close.getByRole('button', { name: 'Close short' }).click();
  expect(sent(log, 'POST', '/purchase-orders/po-7/close')).toEqual([
    { reason: 'The rest is out of stock' },
  ]);
  await expect(main(page)).toContainText('Reason: The rest is out of stock');
});

test('a delivery rejected in full leaves the purchase to close short, never to cancel', async ({
  page,
}) => {
  await open(page, '/purchases/po-7');
  await main(page).getByRole('button', { name: 'It arrived' }).click();
  const arrived = sheet(page, 'It arrived');
  const cards = arrived.locator('div.rounded-card');
  await cards.nth(0).getByLabel('Accepted').fill('0');
  await cards.nth(0).getByLabel('Rejected').fill('20');
  await cards.nth(0).getByLabel('Reject reason').fill('wrong shade');
  await cards.nth(1).getByLabel('Accepted').fill('0');
  await cards.nth(2).getByLabel('Accepted').fill('0');
  await arrived.getByRole('button', { name: 'Record delivery' }).click();
  await expect(arrived).toBeHidden();
  await expect(main(page).getByText('Ordered', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^20 pcs rejected/ })).toContainText(
    'wrong shade',
  );
  await expect(main(page)).toContainText(
    'Everything that came was rejected, so the purchase can now only be closed short.',
  );
  await expect(main(page).getByRole('button', { name: 'Close short' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Cancel purchase' })).toHaveCount(0);
});

test('It arrived on a product kept in batches takes its code and expiry, and on a phone its IMEIs', async ({
  page,
}) => {
  const log = await open(page, '/purchases/po-10', { products: keptOrder() });
  await main(page).getByRole('button', { name: 'It arrived' }).click();
  const arrived = sheet(page, 'It arrived');
  const cream = arrived.locator('div.rounded-card').filter({ hasText: 'Face cream' });
  await cream.getByLabel('Batch code').fill('FC-1209');
  await cream.getByLabel('Expiry').fill('2027-06-30');
  const phone = arrived.locator('div.rounded-card').filter({ hasText: 'Galaxy' });
  await expect(phone).toContainText('IMEIs · 0 of 5 entered');
  await phone.getByRole('button', { name: 'Enter IMEIs' }).click();
  const imeis = sheet(page, 'IMEI / serials');
  await expect(imeis).toContainText('Galaxy A15 · 128 GB · Black · 5 units');
  await imeis.getByRole('tab', { name: 'Type' }).click();
  for (const code of SAMPLE_IMEIS.slice(0, 3)) {
    await imeis.getByLabel('Type an IMEI').fill(code);
    await imeis.getByLabel('Type an IMEI').press('Enter');
  }
  await imeis.getByRole('button', { name: 'Done' }).click();
  await expect(phone).toContainText('IMEIs · 3 of 5 entered');
  await arrived.getByRole('button', { name: 'Record delivery' }).click();
  await expect(arrived).toBeHidden();
  const [body] = sent(log, 'POST', '/purchase-orders/po-10/receipts');
  expect(body?.items).toEqual([
    {
      itemId: 'po-10-fc',
      accepted: 24,
      unitCost: 310,
      batch: { batchCode: 'FC-1209', expiresOn: '2027-06-30' },
    },
    {
      itemId: 'po-10-gx',
      accepted: 5,
      unitCost: null,
      serials: SAMPLE_IMEIS.slice(0, 3),
    },
  ]);
});

test('someone who may only look sees no costs, totals or actions', async ({ page }) => {
  await open(page, '/purchases', {
    isOwner: false,
    permissions: ['inventory:read', 'products:read'],
  });
  await expect(rows(page)).toHaveCount(2);
  await expect(main(page).getByRole('button', { name: 'Order from supplier' })).toHaveCount(0);
  await rows(page).nth(1).click();
  await expect(main(page)).toContainText('Outstanding: 20');
  await expect(main(page)).not.toContainText('Unit cost');
  await expect(main(page)).not.toContainText('Total, at known costs');
  await expect(main(page).getByRole('button', { name: 'It arrived' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Close short' })).toHaveCount(0);
  await expectAccessible(page);
});

test('Suppliers: each with its phone and last purchase; edited, made, archived and brought back', async ({
  page,
}) => {
  const log = await open(page, '/purchases/suppliers');
  // Every supplier's row names its phone, or says it has none.
  const list = main(page).getByRole('button', { name: /no phone|\d{5}-\d{6}/ });
  await expect(main(page).getByRole('button', { name: /Alam Textile/ })).toContainText('no phone');
  const rahim = main(page).getByRole('button', { name: /Rahim Traders/ });
  await expect(rahim).toContainText('01711-000111 · last purchase');
  await expect(list).toHaveCount(3);
  await expectAccessible(page);

  await rahim.click();
  const own = sheet(page, 'Rahim Traders');
  await own.getByLabel('Phone').fill('01711000999');
  await own.getByRole('button', { name: 'Save' }).click();
  expect(sent(log, 'PATCH', '/suppliers/s-rahim')).toEqual([{ phone: '01711000999' }]);

  await main(page).getByRole('button', { name: 'New supplier' }).click();
  const made = sheet(page, 'New supplier');
  await made.getByLabel('Name').fill('Nur Fabrics');
  await made.getByRole('button', { name: 'Save' }).click();
  expect(sent(log, 'POST', '/suppliers')).toEqual([{ name: 'Nur Fabrics' }]);
  await expect(list).toHaveCount(4);

  await main(page)
    .getByRole('button', { name: /Karim Garments/ })
    .click();
  await sheet(page, 'Karim Garments').getByRole('button', { name: 'Archive' }).click();
  expect(sent(log, 'PATCH', '/suppliers/s-karim')).toEqual([{ archived: true }]);
  await expect(list).toHaveCount(3);

  await main(page)
    .getByRole('button', { name: /^Show archived/ })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/purchases/suppliers?archived=1`);
  await expect(main(page)).toContainText('Old Dealer');
  await expect(main(page)).toContainText('bring one back to offer it again');
  await expectAccessible(page);
  // A to Z: Karim Garments before Old Dealer.
  await expect(main(page).getByRole('button', { name: 'Bring back' })).toHaveCount(2);
  await main(page).getByRole('button', { name: 'Bring back' }).first().click();
  expect(sent(log, 'PATCH', '/suppliers/s-karim')).toEqual([
    { archived: true },
    { archived: false },
  ]);
  await expect(main(page)).not.toContainText('Karim Garments');
});

test("a variant's Stock row names where it last came from, and opens which purchases brought it in", async ({
  page,
}) => {
  await open(page, '/stock');
  await main(page)
    .getByRole('button', { name: /^L (In|Low|Out of) stock/ })
    .first()
    .click();
  const own = sheet(page, 'Denim jacket · L');
  await expect(own.getByRole('button', { name: /^Purchases/ })).toContainText(
    /Last from Karim Garments, \d+ \w+/,
  );
  await own.getByRole('button', { name: /^Purchases/ }).click();
  const bought = sheet(page, 'Purchase history');
  await expect(bought).toContainText('Denim jacket · L');
  await expect(bought).toContainText('PO-0006Karim Garments');
  await expect(bought).toContainText('+40 accepted · 2 rejected: torn seams');
  await expect(bought).toContainText('৳1,240 a unit');
  await expectAccessible(page);
});

test('a shop with no purchase yet says so with Order from supplier; with no supplier, with New supplier', async ({
  page,
}) => {
  const products: ProductsFixture = {
    ...stockShop(),
    purchasing: { suppliers: [], purchases: [] },
  };
  await open(page, '/purchases', { products });
  await expect(main(page)).toContainText(
    'No purchases yet. Order from a supplier; stock you add is recorded here too.',
  );
  await expect(main(page)).not.toContainText('Coming');
  await expect(main(page).getByRole('button', { name: 'Order from supplier' })).toHaveCount(2);
  await main(page)
    .getByRole('link', { name: /^Suppliers/ })
    .click();
  await expect(main(page)).toContainText('No suppliers yet.');
  await expect(main(page).getByRole('button', { name: 'New supplier' })).toHaveCount(2);
  await expect(main(page).getByRole('button', { name: /^Show archived/ })).toHaveCount(0);
});
