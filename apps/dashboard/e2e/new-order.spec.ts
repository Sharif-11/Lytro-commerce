import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.31, Slice 4.8a's third part (Part 29's `order-new` to `o29-edit`; ORD-01, ORD-06, ORD-07,
// ORD-11, ORD-22, MNU-04, CMB-03, MNU-02): New order with a known phone, Add an item -- a variant with its stock, a
// combo's choices, an ordinary product's add-ons -- the server's totals, Change price, a payment received already,
// takeaway and a table, a shortfall and a zone the shop doesn't reach; and Edit order from the order's menu. The mocked
// catalogue is the one Part 29 draws. Each test runs on a phone and on a desktop.

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

/** Add an item: the product found, then its variant when it has several. */
async function addItem(page: Page, product: string, variant?: string): Promise<void> {
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await sheet(page, 'Add an item')
    .getByRole('button', { name: new RegExp(`^${product}`) })
    .click();
  if (variant) {
    await sheet(page, product)
      .getByRole('button', { name: new RegExp(`^${variant}`) })
      .click();
  }
}

/** The totals card's figure on a line. */
const figure = (page: Page, label: string | RegExp) =>
  main(page).locator('.kv').filter({ hasText: label }).locator('span').last();

test('a known phone fills the name and its last address; items are added; the totals are the server’s; Create makes it', async ({
  page,
}) => {
  const log = await open(page, '/orders');
  await main(page).getByRole('link', { name: 'New order' }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders/new`);
  await main(page).getByLabel('Phone number').fill('1711 234 567');
  await expect(main(page)).toContainText('Known customer: 4 orders, last at Mirpur');
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Nusrat Jahan');
  await main(page).getByRole('button', { name: 'Use the address' }).click();
  await expect(main(page).getByRole('button', { name: /District and thana/ })).toContainText(
    'Dhaka · Mirpur',
  );
  await expect(main(page).getByLabel('Address')).toHaveValue('House 5, Road 10, Mirpur 11');

  // A product with variants: tapped, then one of them with its price and stock; the one sold out can't be picked.
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  const found = sheet(page, 'Add an item');
  await expect(found.getByRole('button', { name: /^Kids frock/ })).toBeDisabled();
  await expect(found.getByRole('button', { name: /^Denim jacket/ })).toContainText('1 left');
  await found.getByRole('button', { name: /^Cotton T-shirt/ }).click();
  const variants = sheet(page, 'Cotton T-shirt');
  await expect(variants).toContainText('Which one?');
  await expect(variants.getByRole('button', { name: /^XL · Black/ })).toContainText('3 left');
  await expect(variants.getByRole('button', { name: /^L · White/ })).toBeDisabled();
  await variants.getByRole('button', { name: /^L · Black/ }).click();
  await expect(main(page)).toContainText('L · Black · ৳450');
  await main(page).getByRole('button', { name: 'Cotton T-shirt +' }).click();

  // A combo: a size for its choice part, an out-of-stock size greyed; its add-on ticked as the shop set it.
  await addItem(page, 'Eid combo');
  const combo = sheet(page, /^Eid combo/);
  await expect(combo).toContainText('Comes with: Check lungi');
  await expect(combo.getByRole('button', { name: /^XXL/ })).toBeDisabled();
  await expect(combo.getByRole('button', { name: /^Add to the order/ })).toBeDisabled();
  await combo.getByRole('button', { name: 'M', exact: true }).click();
  await expect(combo.getByRole('checkbox')).toBeChecked();
  await combo.getByRole('button', { name: 'Add to the order · ৳2,500' }).click();
  await expect(main(page)).toContainText('Chosen: Cotton panjabi · M, Check lungi');
  await expect(main(page)).toContainText('Add-ons: Gift wrap +৳50');

  await expect(figure(page, 'Subtotal')).toHaveText('৳3,400');
  await expect(figure(page, 'Delivery · Inside Dhaka')).toHaveText('৳70');
  await expect(figure(page, /^Total/)).toHaveText('৳3,470');
  await expect(main(page)).toContainText('Includes VAT 5%');
  await expect(main(page)).toContainText('Inside Dhaka · ৳70');
  expect(sent(log, 'POST', '/orders/quote').at(-1)).not.toHaveProperty('customerName');
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByText('Order #261031-0048 created')).toBeVisible();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-new-48`);
  expect(sent(log, 'POST', '/orders')).toEqual([
    {
      customerName: 'Nusrat Jahan',
      phone: '+8801711234567',
      fulfilmentType: 'delivery',
      locationId: 102,
      deliveryAddress: 'House 5, Road 10, Mirpur 11',
      items: [
        { variantId: 'v-tee-l', quantity: 2 },
        {
          variantId: 'v-eid',
          quantity: 1,
          choices: [{ part: 1, variantIds: ['v-pj-m'] }],
          modifiers: [{ groupId: 'g-wrap', optionIds: ['o-wrap'] }],
        },
      ],
    },
  ]);
  await expect(main(page)).toContainText('#261031-0048');
});

test('an ordinary product’s add-ons come after it: a required group must be answered, ticks up to the most', async ({
  page,
}) => {
  const log = await open(page, '/orders/new');
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await sheet(page, 'Add an item').getByRole('searchbox').fill('burger');
  await sheet(page, 'Add an item')
    .getByRole('button', { name: /^Beef burger/ })
    .click();
  const burger = sheet(page, 'Beef burger · ৳250');
  await expect(burger).toContainText('Spice levelRequired');
  await expect(burger.getByRole('heading', { name: /^Extras/ })).toContainText('Up to 3');
  await expect(burger.getByRole('button', { name: 'Medium' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(burger.getByRole('checkbox', { name: /cheese/i })).toBeChecked();
  await burger.getByRole('button', { name: 'Medium' }).click();
  await expect(burger.getByRole('button', { name: /^Add to the order/ })).toBeDisabled();
  await burger.getByRole('button', { name: 'Hot' }).click();
  await burger.getByText('Bacon').click();
  await burger.getByRole('button', { name: 'Add to the order · ৳320' }).click();
  await expect(main(page)).toContainText('Add-ons: Hot, Extra cheese +৳30, Bacon +৳40');
  await expect(figure(page, 'Subtotal')).toHaveText('৳320');
  await expect
    .poll(() => (sent(log, 'POST', '/orders/quote').at(-1)?.items as unknown[] | undefined)?.[0])
    .toEqual({
      variantId: 'v-burger',
      quantity: 1,
      modifiers: [
        { groupId: 'g-spice', optionIds: ['o-hot'] },
        { groupId: 'g-extras', optionIds: ['o-cheese', 'o-bacon'] },
      ],
    });
});

test('Change price sets a line’s price by hand; one less than one takes the line off', async ({
  page,
}) => {
  const log = await open(page, '/orders/new');
  await addItem(page, 'Cotton T-shirt', 'L · Black');
  await main(page).getByRole('button', { name: 'Change price' }).click();
  const price = sheet(page, 'Change price');
  await expect(price).toContainText("It was ৳450. The change stays in the order's history.");
  await price.getByLabel('Price for each').fill('420');
  await price.getByRole('button', { name: 'Save' }).click();
  await expect(main(page)).toContainText('L · Black · ৳420 · set by hand');
  await expect(figure(page, 'Subtotal')).toHaveText('৳420');
  expect(
    (sent(log, 'POST', '/orders/quote').at(-1)?.items as Record<string, unknown>[])[0],
  ).toMatchObject({ unitPrice: 420 });
  await main(page).getByRole('button', { name: 'Cotton T-shirt −' }).click();
  await expect(main(page).getByRole('button', { name: 'Cotton T-shirt +' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Create order' })).toBeDisabled();
});

test('takeaway needs no address or charge, a table its number; the charge by hand and a discount are priced', async ({
  page,
}) => {
  const log = await open(page, '/orders/new');
  await addItem(page, 'Cotton T-shirt', 'M · Black');
  await main(page).getByRole('radio', { name: 'Takeaway' }).click();
  await expect(main(page)).toContainText('Handed over here; no address or delivery charge');
  await expect(main(page).getByLabel('Address')).toHaveCount(0);
  await expect(main(page).getByText('Already confirmed on the phone')).toHaveCount(0);
  await expect(main(page).locator('.kv').filter({ hasText: 'Delivery' })).toHaveCount(0);

  await main(page).getByRole('radio', { name: 'Table' }).click();
  await expect(main(page)).toContainText('Served at the table; no address or delivery charge');
  await main(page).getByLabel('Table number').fill('4');
  await main(page).getByRole('button', { name: 'Create order' }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-new-48`);
  expect(sent(log, 'POST', '/orders')[0]).toMatchObject({
    fulfilmentType: 'dine_in',
    tableRef: '4',
    items: [{ variantId: 'v-tee-m', quantity: 1 }],
  });
  expect(sent(log, 'POST', '/orders')[0]).not.toHaveProperty('customerName');

  await page.goto(`/${SLUG}/orders/new`);
  await addItem(page, 'Cotton T-shirt', 'M · Black');
  await main(page).getByRole('switch', { name: 'Set the delivery charge by hand' }).click();
  await main(page).getByLabel('Delivery charge', { exact: true }).fill('100');
  await main(page).getByLabel('Order discount').fill('50');
  await expect(figure(page, 'Delivery · Set by hand')).toHaveText('৳100');
  await expect(figure(page, 'Discount')).toHaveText('৳50');
  await expect(figure(page, /^Total/)).toHaveText('৳500');
});

test('a shortfall saves nothing and marks its line; a zone the shop doesn’t reach warns, and the order still saves', async ({
  page,
}) => {
  const log = await open(page, '/orders/new');
  await main(page).getByLabel('Phone number').fill('1819 876 543');
  await main(page).getByLabel('Name', { exact: true }).fill('Rafi Ahmed');
  await main(page)
    .getByRole('button', { name: /District and thana/ })
    .click();
  await sheet(page, 'District and thana').getByRole('searchbox').fill('Ruma');
  await sheet(page, 'District and thana').getByRole('button', { name: 'Ruma · Bandarban' }).click();
  await main(page).getByLabel('Address').fill('Bazar Road');
  await addItem(page, 'Denim jacket', 'M');
  await main(page).getByRole('button', { name: 'Denim jacket +' }).click();
  await expect(main(page)).toContainText(
    "Your delivery zones don't reach Bandarban. The order still saves; set the charge by hand.",
  );
  await expect(figure(page, 'Delivery · Set by hand')).toHaveText('—');

  await main(page).getByRole('button', { name: 'Create order' }).click();
  await expect(main(page)).toContainText(
    'Only 1 Denim jacket is left, so the order was not saved. Lower the number or take the item off.',
  );
  await expect(page).toHaveURL(`/${SLUG}/orders/new`);
  await main(page).getByRole('button', { name: 'Denim jacket −' }).click();
  await main(page).getByRole('button', { name: 'Create order' }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-new-48`);
  // D4-8: a new key once the server refused the first.
  const keys = log.calls.filter((call) => call.method === 'POST' && call.path === '/orders');
  expect(keys).toHaveLength(2);
});

test('the customer already paid: bKash with its number and TrxID; Already confirmed starts it Confirmed', async ({
  page,
}) => {
  const log = await open(page, '/orders/new');
  await main(page).getByLabel('Phone number').fill('1711 234 567');
  await main(page).getByRole('button', { name: 'Use the address' }).click();
  await addItem(page, 'Cotton T-shirt', 'L · Black');
  await main(page).getByRole('switch', { name: 'The customer already paid something' }).click();
  await main(page).getByRole('button', { name: 'bKash' }).click();
  await main(page).getByLabel('Amount').fill('200');
  await main(page).getByLabel('TrxID').fill('9F2KQ7M1');
  await main(page).getByLabel('Sent from').fill('1819 876 543');
  await main(page).getByRole('switch', { name: 'Already confirmed on the phone' }).click();
  await expect(figure(page, 'Advance (received)')).toHaveText('৳200');
  await expect(figure(page, 'Cash on delivery')).toHaveText('৳320');
  await main(page).getByRole('button', { name: 'Create order' }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-new-48`);
  expect(sent(log, 'POST', '/orders')[0]).toMatchObject({
    status: 'confirmed',
    payment: {
      method: 'bkash',
      amount: 200,
      senderNumber: '+8801819876543',
      transactionId: '9F2KQ7M1',
    },
  });
});

test('Edit order from the menu: as the order is, a quantity changed, and only what changed is sent', async ({
  page,
}) => {
  const log = await open(page, '/orders/o-47');
  await main(page)
    .getByRole('button', { name: /^Order #/ })
    .click();
  await sheet(page, /^Order #/)
    .getByRole('button', { name: /^Edit the order/ })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-47/edit`);
  await expect(main(page).getByLabel('Phone number')).toHaveValue('1711 234 567');
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Nusrat Jahan');
  await expect(main(page)).toContainText('L · Black · ৳450');
  await expect(main(page).getByText('The customer already paid something')).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Cotton T-shirt +' }).click();
  await main(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-47`);
  expect(sent(log, 'PATCH', '/orders/o-47')).toEqual([
    {
      items: [
        { lineId: 'o-47-line-0', variantId: 'v-0', quantity: 3 },
        { lineId: 'o-47-line-1', variantId: 'v-1', quantity: 1 },
      ],
    },
  ]);
  await expect(main(page)).toContainText('3 × ৳450');
});

test('someone who may only read orders has no New order', async ({ page }) => {
  await open(page, '/orders', { isOwner: false, permissions: ['orders:read'] });
  await expect(main(page).getByRole('link', { name: 'New order' })).toHaveCount(0);
});
