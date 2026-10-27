import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts, manyProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.4, Slice 11.7a: the product editor -- Basics with the category picker and New category,
// one Save that sends only what changed, a new product in one request, the question before leaving unsaved, the
// product link, Duplicate, Archive and Delete, an archived product's Restore, and the limit (Part 13). Each test runs on
// a phone and on a desktop (playwright.config.ts).

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products/${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog');
}

/** The toast, not a list's loading rows (both are statuses). */
function toast(page: Page) {
  return page.getByRole('status').filter({ hasText: /./ });
}

/** The page's own Save, on a phone at its foot and from 1024 px above the cards. */
function save(page: Page) {
  return main(page).getByRole('button', { name: /^(Save|Fix \d+ things? to save)$/ });
}

function writes(log: ApiLog, method: string) {
  return log.calls.filter((call) => call.method === method && call.path.startsWith('/products'));
}

async function moreSettings(page: Page): Promise<void> {
  await main(page).getByText('More settings').click();
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

test('opens a product with its Basics and link, and one Save sends only what changed', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Cotton T-shirt');
  await expect(main(page).getByLabel('Price', { exact: true })).toHaveValue('450');
  await expect(main(page).getByRole('button', { name: /Category/ })).toContainText('T-shirts');
  await expect(main(page).getByLabel('Description', { exact: true })).toHaveValue(
    '100% cotton, pre-shrunk. Keeps its size after washing.',
  );
  await expect(main(page).getByText('In stock')).toBeVisible();
  // The card's own (its sheet, closed, carries the same link).
  await expect(main(page).getByText('megh.lytro.app/l/cotton-t-shirt').first()).toBeVisible();
  await expectAccessible(page);

  await main(page).getByLabel('Price', { exact: true }).fill('470');
  await save(page).click();
  await expect(toast(page)).toHaveText('Saved. Cotton T-shirt is on the storefront.');
  expect(writes(log, 'PATCH').map((call) => call.body)).toEqual([{ basePrice: 470 }]);
  expect(writes(log, 'PUT')).toEqual([]);
  // Saved: nothing is left to ask about on the way out.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page).toHaveURL(`/${SLUG}`);
});

test('a new product says what is missing, then saves in one request and returns to the list', async ({
  page,
}) => {
  const log = await open(page, 'new');
  await save(page).click();
  await expect(save(page)).toHaveText('Fix 2 things to save');
  await expect(main(page).getByRole('alert').first()).toHaveText('Fix 2 things to save');
  await expect(main(page).getByText('A name is needed')).toBeVisible();
  await expect(main(page).getByText('A price is needed')).toBeVisible();
  await expectAccessible(page);

  await main(page).getByLabel('Name', { exact: true }).fill('Panjabi');
  await main(page).getByLabel('Price', { exact: true }).fill('12.345');
  await expect(main(page).getByText('A price is a number, like 450 or 99.50')).toBeVisible();
  await main(page).getByLabel('Price', { exact: true }).fill('1250');
  await main(page)
    .getByRole('button', { name: /Category/ })
    .click();
  await sheet(page).getByRole('checkbox', { name: 'Jackets' }).check();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  await expect(toast(page)).toHaveText('Saved. Panjabi is on the storefront.');
  expect(writes(log, 'POST').map((call) => call.body)).toEqual([
    {
      name: 'Panjabi',
      basePrice: 1250,
      description: null,
      categoryIds: ['c-jackets'],
      primaryCategoryId: 'c-jackets',
      active: true,
    },
  ]);
  await expect(main(page).getByRole('link', { name: /Panjabi/ })).toBeVisible();
});

test('picks categories: ticks, the primary, none, and a new one made in a step of the sheet', async ({
  page,
}) => {
  const log = await open(page, 'p-1');
  await main(page)
    .getByRole('button', { name: /Category/ })
    .click();
  await expect(sheet(page).getByText('Primary', { exact: true })).toBeVisible();
  await sheet(page).getByRole('checkbox', { name: 'Jackets' }).check();
  await sheet(page).getByRole('button', { name: 'Make primary' }).click();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByRole('button', { name: /Category/ })).toContainText('Jackets +1');

  await main(page)
    .getByRole('button', { name: /Category/ })
    .click();
  await sheet(page).getByRole('button', { name: 'New category' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'New category' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByText('A name is needed')).toBeVisible();
  await sheet(page).getByLabel('Name', { exact: true }).fill('Shirts');
  await sheet(page).getByLabel('Parent').selectOption({ label: 'T-shirts' });
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByRole('checkbox', { name: 'Shirts', exact: true })).toBeChecked();
  expect(log.sent('POST', '/categories')).toEqual({
    name: 'Shirts',
    parentId: 'c-tshirts',
    visible: true,
    behavesLike: null,
  });
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await save(page).click();
  await expect(toast(page)).toBeVisible();
  const sent = writes(log, 'PATCH').at(-1)?.body as { categoryIds: string[] };
  expect(sent).toMatchObject({ primaryCategoryId: 'c-jackets' });
  expect(sent.categoryIds).toHaveLength(3);

  // Uncategorized files it in none.
  await main(page)
    .getByRole('button', { name: /Category/ })
    .click();
  await sheet(page).getByRole('checkbox', { name: 'Uncategorized' }).check();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByRole('button', { name: /Category/ })).toContainText('Uncategorized');
});

test('asks before leaving with changes unsaved: Keep editing stays, Leave goes', async ({
  page,
}) => {
  await open(page, 'p-1');
  await main(page).getByLabel('Name', { exact: true }).fill('Cotton tee');
  await page.getByRole('link', { name: 'Home' }).first().click();
  const ask = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(ask).toContainText(
    'Your changes to Cotton T-shirt are not saved yet. If you leave now, they are lost.',
  );
  await expectAccessible(page);
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  await expect(ask).toBeHidden();
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Cotton tee');
  await page.getByRole('link', { name: 'Home' }).first().click();
  await ask.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(`/${SLUG}`);

  // A new product says so in its own words.
  await page.goto(`/${SLUG}/products/new`);
  await main(page).getByLabel('Name', { exact: true }).fill('Kurta');
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toContainText(
    'This new product is not saved yet.',
  );
});

test('a refused field is said under it, and Save counts what is left to fix', async ({ page }) => {
  await open(page, 'p-1', { products: { ...drawnProducts(), refuse: { name: 'Taken' } } });
  await main(page).getByLabel('Name', { exact: true }).fill('Taken');
  await save(page).click();
  await expect(main(page).getByText('A product already has that name.')).toBeVisible();
  await expect(save(page)).toHaveText('Fix 1 thing to save');
});

test('the link: Copy, a variant for it, and changing it', async ({ page }) => {
  const log = await open(page, 'p-1', {
    products: { ...drawnProducts(), refuse: { slug: 'taken' } },
  });
  await main(page).getByRole('button', { name: 'Pick a variant to add ?v= to the link.' }).click();
  await sheet(page).getByLabel('Pick a variant (optional)').selectOption({ label: 'M · Black' });
  await expect(sheet(page).getByText('megh.lytro.app/l/cotton-t-shirt?v=p-1-v3')).toBeVisible();
  await sheet(page).getByText('Change the link', { exact: true }).first().click();
  await sheet(page).getByLabel('Link name').fill('taken');
  await sheet(page).getByRole('button', { name: 'Change the link' }).click();
  await expect(sheet(page).getByText('Another product has that link.')).toBeVisible();
  await sheet(page).getByLabel('Link name').fill('cotton-tee');
  await sheet(page).getByRole('button', { name: 'Change the link' }).click();
  await expect(toast(page)).toHaveText('Link changed');
  expect(log.sent('PUT', '/products/p-1/slug')).toEqual({ slug: 'cotton-tee' });
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByText('megh.lytro.app/l/cotton-tee').first()).toBeVisible();
});

test('Duplicate opens the copy, and at the limit says so first', async ({ page }) => {
  await open(page, 'p-1');
  await moreSettings(page);
  await main(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/products/p-new-\\d+$`));
  await expect(toast(page)).toHaveText('Copied · inactive until you turn it on');
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveValue('Cotton T-shirt (copy)');

  await page.unrouteAll();
  const log = await open(page, 'p-1', { products: { ...manyProducts(6), limit: 6 } });
  await moreSettings(page);
  await main(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(main(page).getByRole('alert').first()).toContainText('Plan limit: 6 products');
  expect(writes(log, 'POST')).toEqual([]);
});

test('Archive and Delete for good ask first, then go back to the list with a toast', async ({
  page,
}) => {
  const log = await open(page, 'p-2');
  await moreSettings(page);
  await main(page).getByRole('button', { name: 'Archive' }).click();
  const ask = page.getByRole('dialog', { name: 'Remove this product?' });
  await expect(ask.getByRole('radio', { name: /Archive/ })).toHaveAttribute('aria-checked', 'true');
  await expectAccessible(page);
  await ask.getByRole('button', { name: 'Archive' }).last().click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  await expect(toast(page)).toHaveText('Denim jacket archived · find it under Archived');
  expect(log.calls.some((call) => call.method === 'DELETE' && call.query === '')).toBe(true);

  await page.goto(`/${SLUG}/products/p-3`);
  await moreSettings(page);
  await main(page).getByRole('button', { name: 'Delete for good' }).click();
  await page
    .getByRole('dialog', { name: 'Remove this product?' })
    .getByRole('button', { name: 'Delete for good' })
    .last()
    .click();
  await expect(toast(page)).toHaveText('Silk saree deleted');
  expect(log.calls.some((call) => call.method === 'DELETE' && call.query === '?hard=true')).toBe(
    true,
  );
});

test('an archived product shows its own page, with Restore', async ({ page }) => {
  const log = await open(page, 'p-7');
  await expect(main(page).getByText('This product is archived')).toBeVisible();
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveJSProperty('readOnly', true);
  await expect(save(page)).toHaveCount(0);
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Restore' }).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  await expect(toast(page)).toHaveText('Linen panjabi is back in the list');
  expect(log.calls.some((call) => call.path === '/products/p-7/restore')).toBe(true);
});

test('at the limit, Restore and a new product say so before anything is sent', async ({ page }) => {
  const products = drawnProducts();
  const log = await open(page, 'p-7', { products: { ...products, limit: 6 } });
  await main(page).getByRole('button', { name: 'Restore' }).click();
  await expect(main(page).getByRole('alert').first()).toContainText('Plan limit: 6 products');
  expect(log.calls.some((call) => call.path.endsWith('/restore'))).toBe(false);

  await page.goto(`/${SLUG}/products/new`);
  await expect(page).toHaveURL(`/${SLUG}/products?limit=true`);
  await expect(main(page).getByRole('alert')).toContainText('so a new product cannot be added');
});

test('a product that is not there says so', async ({ page }) => {
  await mockApi(page, { language: 'en' });
  await page.goto(`/${SLUG}/products/p-gone`);
  await expect(
    page.getByText('This product was not found; it may have been deleted.'),
  ).toBeVisible();
});

test('someone who may only read products sees the fields and no Save', async ({ page }) => {
  await open(page, 'p-1', { isOwner: false, permissions: ['products:read'] });
  await expect(main(page).getByLabel('Name', { exact: true })).toHaveJSProperty('readOnly', true);
  await expect(save(page)).toHaveCount(0);
  await moreSettings(page);
  await expect(main(page).getByRole('button', { name: 'Duplicate' })).toHaveCount(0);
});
