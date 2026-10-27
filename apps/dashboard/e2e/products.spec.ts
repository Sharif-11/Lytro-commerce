import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { manyProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.3, Slice 11.7a: Products -- the segments counted and filtered by the server, the search,
// the category filter, Show more past 20, the archived ones, a new shop's empty list, and Add product at the limit
// (Part 13). Each test runs on a phone and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}, query = ''): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/products${query}`);
  await expect(page.getByRole('heading', { name: 'Products', exact: true }).first()).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function rows(page: Page) {
  return main(page).getByRole('link', { name: /variant/ });
}

function segment(page: Page, name: string) {
  return main(page)
    .getByRole('group')
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

/** The query each list request sent, newest last. */
function listQueries(log: ApiLog): string[] {
  return log.calls
    .filter((call) => call.path === '/products' && !call.query.includes('limit=1'))
    .map((call) => call.query);
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

test('lists the products with each segment counted by the server, and asks it for a segment', async ({
  page,
}) => {
  const log = await open(page);
  await expect(rows(page)).toHaveCount(6);
  await expect(rows(page).first()).toContainText('Cotton T-shirt');
  await expect(rows(page).first()).toContainText('10 variants · T-shirts');
  await expect(rows(page).first()).toContainText('৳450–490');
  await expect(rows(page).first()).toContainText('In stock');
  await expect(rows(page).filter({ hasText: 'Hoodie' })).toContainText('Inactive');
  for (const [name, count] of [
    ['All', 6],
    ['Active', 5],
    ['Inactive', 1],
    ['Low stock', 1],
    ['Out of stock', 1],
    ['Archived', 2],
  ] as const) {
    await expect(segment(page, name)).toHaveText(new RegExp(`${name}\\s*${String(count)}$`));
  }
  await expectAccessible(page);

  await segment(page, 'Low stock').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Denim jacket');
  await expect(page).toHaveURL(/seg=low/);
  expect(listQueries(log).at(-1)).toContain('active=true&stock=low');
  // The counts are the segments', whatever segment is shown.
  await expect(segment(page, 'All')).toHaveText(/All\s*6$/);

  await segment(page, 'Inactive').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Hoodie');
  expect(listQueries(log).at(-1)).toContain('active=false');
});

test('a product row opens its page, and Back from it keeps the list as it was', async ({
  page,
}) => {
  await open(page, {}, '?seg=out');
  await rows(page).first().click();
  await expect(page).toHaveURL(`/${SLUG}/products/p-4`);
  await page.goBack();
  await expect(page).toHaveURL(`/${SLUG}/products?seg=out`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Kids frock');
});

test('searches by name and filters by a category from the tree, each cleared in one tap', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('searchbox', { name: 'Search products' }).fill('jacket');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Denim jacket');
  expect(listQueries(log).at(-1)).toContain('search=jacket');
  await main(page).getByRole('searchbox').fill('');
  await expect(rows(page)).toHaveCount(6);

  const filter = main(page).getByRole('button', { name: 'Filter by category' });
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await filter.click();
  const sheet = page.getByRole('dialog', { name: 'Filter by category' });
  await expect(sheet.getByRole('radio')).toHaveText([
    'All categories',
    'T-shirts',
    'Men',
    'Women',
    'Jackets',
    'Sarees',
    'Kids',
    'Accessories',
    'Uncategorized',
  ]);
  await expect(sheet.getByRole('radio', { name: 'All categories' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expectAccessible(page);
  await sheet.getByRole('radio', { name: 'Jackets' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/cat=c-jackets/);
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(2);
  await expect(segment(page, 'All')).toHaveText(/All\s*2$/);
  await expect(segment(page, 'Inactive')).toHaveText(/Inactive\s*1$/);
  expect(listQueries(log).at(-1)).toContain('categoryId=c-jackets');

  await main(page).getByRole('button', { name: 'Clear the Jackets filter' }).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
});

test('says when nothing matches, and Show all clears the search, segment and category', async ({
  page,
}) => {
  await open(page, {}, '?seg=low&cat=c-kids');
  await expect(main(page).getByText('No products match.')).toBeVisible();
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'Show all products' }).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  await expect(rows(page)).toHaveCount(6);
});

test('Archived lists the archived products, marked so, and is not offered when none is', async ({
  page,
}) => {
  const log = await open(page);
  await segment(page, 'Archived').click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('Linen panjabi');
  await expect(rows(page).first()).toContainText('4 variants · Uncategorized');
  await expect(rows(page).first()).toContainText('Archived');
  expect(listQueries(log).at(-1)).toContain('archived=true');

  await page.unrouteAll();
  // A shop with products, none of them archived.
  await open(page, { products: manyProducts(6) });
  await expect(rows(page)).toHaveCount(6);
  await expect(main(page).getByRole('button', { name: /^Archived/ })).toHaveCount(0);
});

test('shows 20 at a time, with Show more and how many are shown', async ({ page }) => {
  await open(page, { products: manyProducts(46) });
  await expect(rows(page)).toHaveCount(20);
  await expect(main(page).getByText('Showing 20 of 46')).toBeVisible();
  await main(page).getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveCount(40);
  await main(page).getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveCount(46);
  await expect(main(page).getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('a new shop starts empty, with the trial’s limit and Add product', async ({ page }) => {
  await open(page, { state: 'trial', products: { limit: 20, products: [] } });
  await expect(
    main(page).getByText('No products yet. The trial allows 20 products.'),
  ).toBeVisible();
  await expect(main(page).getByRole('searchbox')).toHaveCount(0);
  const add = main(page).getByRole('link', { name: 'Add product' });
  await expect(add.last()).toHaveAttribute('href', `/${SLUG}/products/new`);
  await expectAccessible(page);
});

test('at the limit, Add product says so before anything is typed, with the ways to more room', async ({
  page,
}) => {
  await open(page, {
    products: { ...manyProducts(6), limit: 6 },
    money: { usage: { used: { products: 6 }, limits: { products: 6 } } },
  });
  await main(page).getByRole('link', { name: 'Add product' }).click();
  await expect(page).toHaveURL(`/${SLUG}/products?limit=true`);
  const banner = main(page).getByRole('alert');
  await expect(banner).toContainText('Plan limit: 6 products');
  await expect(banner).toContainText(
    'You have 6, so a new product cannot be added. Everything you have keeps selling.',
  );
  // The ways out in the server's order, worded as Usage words them.
  await expect(banner).toContainText(
    'To raise it: the Extra 500 products add-on · the Growth plan',
  );
  await expect(banner.getByRole('link', { name: 'See plans' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan`,
  );
  await expectAccessible(page);
});

test('at the limit, someone who may not pay is told the owner can raise it', async ({ page }) => {
  await open(page, {
    isOwner: false,
    permissions: ['products:read', 'products:manage'],
    products: { ...manyProducts(6), limit: 6 },
  });
  await main(page).getByRole('link', { name: 'Add product' }).click();
  const banner = main(page).getByRole('alert');
  await expect(banner).toContainText('The shop owner can raise the limit.');
  await expect(banner.getByRole('link')).toHaveCount(0);
});

test('someone who may only read products sees no Add product', async ({ page }) => {
  await open(page, { isOwner: false, permissions: ['products:read'] });
  await expect(rows(page)).toHaveCount(6);
  await expect(main(page).getByRole('link', { name: 'Add product' })).toHaveCount(0);
});
