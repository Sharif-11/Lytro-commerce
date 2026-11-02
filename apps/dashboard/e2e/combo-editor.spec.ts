import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { withEidCombo } from './support/combos';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.33, Slice 4.8c's second part (the prototype's Part 31; CMB-01, CMB-02, CMB-06 to CMB-08,
// PRD-13, UOM-03): New product's choice, a combo's form, adding and changing its parts, what they come to as they stand,
// why it is out of stock, and a product inside a combo being refused deleting. Each test runs on a phone and a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, {
    language: 'en',
    products: withEidCombo(drawnProducts()),
    ...state,
  });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');

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

/** New product, as a combo, its name and price typed. */
async function newCombo(page: Page, price = '2450'): Promise<void> {
  await main(page).getByRole('radio', { name: 'Combo pack' }).click();
  await main(page).getByLabel('Name', { exact: true }).fill('Eid combo');
  await main(page).getByLabel('Price', { exact: true }).fill(price);
}

/** Add an item: this product, these of its variants ticked. */
async function addPart(page: Page, product: RegExp, variants: readonly string[]): Promise<void> {
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await page
    .getByRole('dialog', { name: 'Which product?' })
    .getByRole('button', { name: product })
    .click();
  const sheet = page.getByRole('dialog', { name: /which can go in\?/ });
  for (const variant of variants) {
    await sheet.getByRole('checkbox', { name: new RegExp(`^${variant}\\b`) }).click();
  }
  await sheet.getByRole('button', { name: 'Add to the combo' }).click();
  await expect(sheet).toHaveCount(0);
}

test('New product asks Product or Combo pack; a combo has parts in place of variants, stock and add-ons', async ({
  page,
}) => {
  await open(page, '/products/new');
  await expect(main(page)).toContainText("Once made, this can't be changed");
  await expect(main(page).getByRole('radio', { name: 'Product', exact: true })).toBeChecked();
  await expect(main(page).getByText('Add-ons', { exact: true })).toBeVisible();

  await main(page).getByRole('radio', { name: 'Combo pack' }).click();
  await expect(main(page).getByRole('heading', { name: "What's inside" })).toBeVisible();
  await expect(main(page)).toContainText('Nothing inside yet. Add the products that go in it.');
  await expect(main(page)).toContainText('A combo holds no stock of its own');
  await expect(main(page).getByText('Add-ons', { exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('radio', { name: 'Stock is tracked' })).toHaveCount(0);
  await main(page).getByText('More settings').click();
  await expect(main(page).getByLabel('Tax class')).toBeVisible();
  await expect(main(page).getByLabel('Condition')).toHaveCount(0);
  await expectAccessible(page);
});

test('Save with nothing inside asks for an item and sends nothing', async ({ page }) => {
  const log = await open(page, '/products/new');
  await newCombo(page);
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page)).toContainText('A combo needs at least one item.');
  await expect(main(page).getByRole('button', { name: 'Fix 1 thing to save' })).toBeVisible();
  expect(sent(log, 'POST', '/products')).toEqual([]);
  expect(sent(log, 'POST', '/products/combo-quote')).toEqual([]);
});

test('a part: a combo can’t go in; ticks make it fixed or a choice; the figures follow as it stands', async ({
  page,
}) => {
  const log = await open(page, '/products/new');
  await newCombo(page);

  await main(page).getByRole('button', { name: 'Add an item' }).click();
  const pick = page.getByRole('dialog', { name: 'Which product?' });
  await expect(pick.getByRole('button', { name: /^Cotton panjabi/ })).toContainText(
    'S · M · L · XL',
  );
  await expect(pick.getByRole('button', { name: /^Check lungi/ })).toContainText('1 variant');
  await expect(pick).toContainText("A combo can't go inside another");
  await expect(pick.getByRole('button', { name: /^Winter combo/ })).toHaveCount(0);
  await expectAccessible(page);
  await pick.getByRole('button', { name: /^Cotton panjabi/ }).click();

  const tick = page.getByRole('dialog', { name: 'Cotton panjabi · which can go in?' });
  const add = tick.getByRole('button', { name: 'Add to the combo' });
  await expect(add).toBeDisabled();
  await expect(tick).toContainText('8 left');
  await tick.getByRole('checkbox', { name: /^S\b/ }).click();
  await expect(tick).toContainText('1 ticked: always this one');
  await tick.getByRole('checkbox', { name: /^M\b/ }).click();
  await tick.getByRole('checkbox', { name: /^L\b/ }).click();
  await expect(tick).toContainText('3 ticked: the customer picks');
  await expectAccessible(page);
  await add.click();

  const inside = main(page);
  await expect(inside).toContainText('Customer picks: S, M, L');
  await expect(inside).toContainText('1 in each combo · ৳1,800');
  await addPart(page, /^Check lungi/, []);
  await expect(inside).toContainText('Always this one');
  await expect(inside).toContainText('Bought apart');
  await expect(inside).toContainText('৳2,800');
  await expect(inside).toContainText('Customer saves');
  await expect(inside).toContainText('৳350');
  await expect(inside).toContainText('Limited by Check lungi · 6 left');
  await expect
    .poll(() => sent(log, 'POST', '/products/combo-quote').at(-1))
    .toEqual({
      parts: [
        { quantity: 1, variantIds: ['v-pan-s', 'v-pan-m', 'v-pan-l'] },
        { quantity: 1, variantIds: ['v-lungi'] },
      ],
      basePrice: 2450,
    });
  // The saving follows the price, once typing rests.
  await main(page).getByLabel('Price', { exact: true }).fill('2000');
  await expect(inside).toContainText('৳800');
  await main(page).getByLabel('Price', { exact: true }).fill('3000');
  await expect(inside).not.toContainText('Customer saves');
});

test('a new combo saves its fields and parts, nothing of a product’s stock, and opens with its link', async ({
  page,
}) => {
  const log = await open(page, '/products/new');
  await newCombo(page);
  await addPart(page, /^Check lungi/, []);
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Eid combo saved')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/products/p-new-`));
  const [body] = sent(log, 'POST', '/products');
  expect(body).toMatchObject({
    name: 'Eid combo',
    basePrice: 2450,
    kind: 'combo',
    parts: [{ quantity: 1, variantIds: ['v-lungi'] }],
  });
  for (const field of ['stockTracking', 'stockUnit', 'batchTracked', 'serialTracked', 'variants']) {
    expect(body).not.toHaveProperty(field);
  }
  await expect(main(page)).toContainText('Combo');
  await expect(main(page).getByRole('radio', { name: 'Combo pack' })).toHaveCount(0);
});

test('a saved combo opens as one; a part changes or goes; only the parts are sent, and nothing is left unsaved', async ({
  page,
}) => {
  const log = await open(page, '/products/p-eid');
  await expect(main(page)).toContainText('Customer picks: S, M, L');
  await expect(main(page).getByRole('radio', { name: 'Combo pack' })).toHaveCount(0);
  await expect(main(page).getByText('Add-ons', { exact: true })).toHaveCount(0);
  await main(page).getByText('More settings').click();
  await expect(main(page).getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Archive' })).toBeVisible();

  await main(page).getByRole('button', { name: 'Change Cotton panjabi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cotton panjabi · which can go in?' });
  await expect(sheet.getByRole('checkbox', { name: /^M\b/ })).toBeChecked();
  await expect(sheet.getByRole('checkbox', { name: /^XL\b/ })).not.toBeChecked();
  await sheet.getByRole('checkbox', { name: /^L\b/ }).click();
  await sheet.getByRole('button', { name: 'How many in each combo +' }).click();
  await expect(sheet.getByRole('button', { name: 'Remove from the combo' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(main(page)).toContainText('Customer picks: S, M');
  await expect(main(page)).toContainText('2 in each combo · ৳3,600');

  await main(page).getByRole('button', { name: 'Change Check lungi' }).click();
  await page
    .getByRole('dialog', { name: 'Check lungi · which can go in?' })
    .getByRole('button', { name: 'Remove from the combo' })
    .click();
  await expect(main(page).getByRole('button', { name: 'Change Check lungi' })).toHaveCount(0);

  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Eid combo saved')).toBeVisible();
  expect(sent(log, 'PATCH', '/products/p-eid')).toEqual([
    { parts: [{ quantity: 2, variantIds: ['v-pan-s', 'v-pan-m'] }] },
  ]);
  // Saved: leaving asks nothing.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}$`));
});

test('sold by weight: part of a unit while one is ticked, read back with its unit; a choice counts whole', async ({
  page,
}) => {
  const products = withEidCombo(drawnProducts());
  const picker = products.picker ?? [];
  const rice = picker.find((each) => each.id === 'p-rice');
  if (!rice) throw new Error('p-rice');
  rice.searchedOnly = false;
  rice.variants.push({ id: 'v-rice2', label: ['Coarse', 'Coarse'], price: 60, available: 10 });
  const first = rice.variants[0];
  if (first) first.label = ['Fine', 'Fine'];
  const log = await open(page, '/products/new', { products });
  await newCombo(page);
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await page
    .getByRole('dialog', { name: 'Which product?' })
    .getByRole('button', { name: /^Miniket rice/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Miniket rice · which can go in?' });
  await expect(sheet).toContainText('25 kg left');
  await sheet.getByRole('checkbox', { name: /^Fine\b/ }).click();
  const amount = sheet.getByRole('textbox', { name: 'How many in each combo' });
  await amount.fill('0');
  await expect(sheet.getByText('More than 0, up to 20')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Add to the combo' })).toBeDisabled();
  await amount.fill('0.5');
  await sheet.getByRole('checkbox', { name: /^Coarse\b/ }).click();
  // Two ticked: the customer picks one for each unit, so it is whole.
  await expect(amount).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'How many in each combo +' })).toBeVisible();
  await sheet.getByRole('checkbox', { name: /^Coarse\b/ }).click();
  await amount.fill('0.5');
  await sheet.getByRole('button', { name: 'Add to the combo' }).click();
  await expect(main(page)).toContainText('0.5 kg in each combo · ৳40');
  await expect
    .poll(() => sent(log, 'POST', '/products/combo-quote').at(-1))
    .toMatchObject({ parts: [{ quantity: 0.5, variantIds: ['v-rice'] }] });
});

test('a variant off sale says so and can still be ticked', async ({ page }) => {
  const products = withEidCombo(drawnProducts());
  const panjabi = products.picker?.find((each) => each.id === 'p-panjabi');
  const xl = panjabi?.variants.find((each) => each.id === 'v-pan-xl');
  if (!xl) throw new Error('v-pan-xl');
  xl.offSale = true;
  await open(page, '/products/new', { products });
  await newCombo(page);
  await main(page).getByRole('button', { name: 'Add an item' }).click();
  await page
    .getByRole('dialog', { name: 'Which product?' })
    .getByRole('button', { name: /^Cotton panjabi/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Cotton panjabi · which can go in?' });
  await expect(sheet.getByText('4 left · Off sale')).toBeVisible();
  await sheet.getByRole('checkbox', { name: /^XL\b/ }).click();
  await expect(sheet.getByRole('button', { name: 'Add to the combo' })).toBeEnabled();
});

for (const [reason, words] of [
  ['part_archived', 'Check lungi is archived, so the combo is out of stock. Restore it'],
  ['part_off_sale', 'Check lungi is off sale, so the combo is out of stock. Put it back'],
  ['part_retired', "Check lungi's variant is gone, so the combo is out of stock. Change the item."],
] as const) {
  test(`out of stock says why, and the fix: ${reason}`, async ({ page }) => {
    const products = withEidCombo(drawnProducts());
    const lungi = products.picker?.find((each) => each.id === 'p-lungi')?.variants[0];
    if (!lungi) throw new Error('v-lungi');
    lungi.gone = reason;
    const combo = products.products.find((each) => each.id === 'p-eid');
    if (combo) combo.stockState = 'out';
    await open(page, '/products/p-eid', { products });
    await expect(page.getByRole('alert').filter({ hasText: words })).toBeVisible();
    await expect(main(page)).toContainText('Can make now');
    await expectAccessible(page);
  });
}

test('no choice left names the part and its fix', async ({ page }) => {
  const products = withEidCombo(drawnProducts());
  const panjabi = products.picker?.find((each) => each.id === 'p-panjabi');
  for (const variant of panjabi?.variants ?? []) variant.gone = 'part_off_sale';
  await open(page, '/products/p-eid', { products });
  await expect(
    page.getByRole('alert').filter({ hasText: 'No size of Cotton panjabi is on sale' }),
  ).toBeVisible();
});

test('a part whose variant has gone is named when the parts are saved again', async ({ page }) => {
  const products = withEidCombo(drawnProducts());
  const small = products.picker
    ?.find((each) => each.id === 'p-panjabi')
    ?.variants.find((each) => each.id === 'v-pan-s');
  if (!small) throw new Error('v-pan-s');
  small.gone = 'part_retired';
  await open(page, '/products/p-eid', { products });
  await main(page).getByRole('button', { name: 'Change Check lungi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Check lungi · which can go in?' });
  await sheet.getByRole('button', { name: 'How many in each combo +' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page)).toContainText('One of its variants is gone. Open it and tick again.');
  await expect(page.getByRole('alert').filter({ hasText: 'Fix 1 thing to save' })).toBeVisible();
});

test('someone who may only look: no changes and no quote; stock’s reader sees what it can make', async ({
  page,
}) => {
  const log = await open(page, '/products/p-eid', {
    isOwner: false,
    permissions: ['products:read'],
  });
  await expect(main(page)).toContainText('Customer picks: S, M, L');
  await expect(main(page).getByRole('button', { name: 'Add an item' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Change / })).toHaveCount(0);
  await expect(main(page)).not.toContainText('Can make now');
  expect(sent(log, 'POST', '/products/combo-quote')).toEqual([]);

  const products = withEidCombo(drawnProducts());
  const combo = products.products.find((each) => each.id === 'p-eid');
  if (combo) {
    combo.combo = {
      canMake: 6,
      limitedBy: { position: 2, productName: 'Check lungi', available: '6.000' },
      issues: [],
    };
  }
  await open(page, '/products/p-eid', {
    isOwner: false,
    permissions: ['products:read', 'inventory:read'],
    products,
  });
  await expect(main(page)).toContainText('Can make now');
  await expect(main(page)).toContainText('Limited by Check lungi · 6 left');
  await expect(main(page)).not.toContainText('Bought apart');
});

test('a product in a combo can’t be deleted for good: the dialog names it, with the way in', async ({
  page,
}) => {
  const products = withEidCombo(drawnProducts());
  products.inCombos = { 'p-1': [{ id: 'p-eid', name: 'Eid combo' }] };
  await open(page, '/products/p-1', { products });
  await main(page).getByText('More settings').click();
  await main(page).getByRole('button', { name: 'Delete for good' }).click();
  await page
    .getByRole('dialog', { name: 'Remove this product?' })
    .getByRole('button', { name: 'Delete for good' })
    .click();
  const refused = page.getByRole('dialog', { name: "Cotton T-shirt can't be deleted" });
  await expect(refused).toContainText('It is inside "Eid combo".');
  await expectAccessible(page);
  await refused.getByRole('link', { name: 'Open the combo' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/products/p-eid`));
  await expect(main(page)).toContainText('Customer picks: S, M, L');
});

test('in several combos it names them all, with a way into each; OK stays on the product', async ({
  page,
}) => {
  const products = withEidCombo(drawnProducts());
  products.inCombos = {
    'p-1': [
      { id: 'p-eid', name: 'Eid combo' },
      { id: 'p-winter', name: 'Winter combo' },
    ],
  };
  await open(page, '/products/p-1', { products });
  await main(page).getByText('More settings').click();
  await main(page).getByRole('button', { name: 'Delete for good' }).click();
  await page
    .getByRole('dialog', { name: 'Remove this product?' })
    .getByRole('button', { name: 'Delete for good' })
    .click();
  const refused = page.getByRole('dialog', { name: "Cotton T-shirt can't be deleted" });
  await expect(refused).toContainText('It is inside "Eid combo" and "Winter combo".');
  await expect(refused.getByRole('link', { name: 'Open Eid combo' })).toBeVisible();
  await expect(refused.getByRole('link', { name: 'Open Winter combo' })).toBeVisible();
  await refused.getByRole('button', { name: 'OK' }).click();
  await expect(refused).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/products/p-1`));
});

test('an archived product in a combo is refused the same way', async ({ page }) => {
  const products = withEidCombo(drawnProducts());
  const first = products.products.find((each) => each.id === 'p-1');
  if (first) first.archived = true;
  products.inCombos = { 'p-1': [{ id: 'p-eid', name: 'Eid combo' }] };
  await open(page, '/products/p-1', { products });
  await main(page).getByRole('button', { name: 'Delete for good' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByRole('dialog', { name: "Cotton T-shirt can't be deleted" })).toBeVisible();
});

test('Products lists a combo with its tag in place of its variants', async ({ page }) => {
  await open(page, '/products');
  const row = main(page).getByRole('link', { name: /^Eid combo/ });
  await expect(row).toContainText('Combo');
  await expect(row).not.toContainText('1 variant');
  await expect(row).toHaveAttribute('href', `/${SLUG}/products/p-eid`);
  await expect(main(page).getByRole('link', { name: /^Silk saree/ })).toContainText('1 variant');
});
