import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { meghOrders } from './support/orders';
import { withShortAndCombos } from './support/stock';
import { drawnProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.33, Slice 4.8c's first part (the prototype's `k31-stock`, `sh-k31-history`,
// `p31-home-short`, `o29-holding`; INV-15, CMB-02, CMB-05, CMB-08): what's short for orders, with Add stock and See the
// orders holding it; the combos with what they can make or why they can't; stock history naming the order and combo.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, {
    language: 'en',
    products: withShortAndCombos(drawnProducts()),
    ...state,
  });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');

/** Picks a variant in Stock history's sheet. */
async function pickVariant(page: Page, variant: string): Promise<void> {
  await page
    .getByRole('dialog', { name: 'Stock history' })
    .getByRole('button', { name: /^Product · variant/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Pick a variant' })
    .getByRole('radio', { name: new RegExp(`^${variant}`) })
    .click();
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

test('Stock shows what orders hold beyond the shelf, each with its figures and what to do', async ({
  page,
}) => {
  const log = await open(page, '/stock');
  await expect(main(page)).toContainText('1 product has less on the shelf than orders hold');
  await expect(main(page)).toContainText('It happens after a stock check or a write-off.');
  await expect(main(page)).toContainText('3 held for orders · 2 on hand · 1 short');
  await expectAccessible(page);
  expect(log.calls.some((call) => call.query.includes('short=true'))).toBe(true);
  expect(
    log.calls.some(
      (call) => call.path === '/inventory/stock' && call.query.includes('kind=standard'),
    ),
  ).toBe(true);
});

test('Add stock on a short row opens its sheet; a search or a segment shows the list alone', async ({
  page,
}) => {
  await open(page, '/stock');
  await main(page)
    .getByRole('button', { name: /^Add stock.*Cotton T-shirt/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('Add stock');
  await page.keyboard.press('Escape');

  await page.goto(`/${SLUG}/stock?seg=low`);
  await expect(main(page)).not.toContainText('held for orders');
  await expect(main(page)).not.toContainText('Combos');
});

test('See the orders opens only the orders holding it, with a chip that clears', async ({
  page,
}) => {
  const orders = meghOrders();
  for (const order of orders.orders) if (order.id === 'o-47') order.holds = ['p-1-short'];
  const log = await open(page, '/stock', { orders });
  await main(page)
    .getByRole('link', { name: /^See the orders holding/ })
    .click();
  await expect(page).toHaveURL(/\/orders\?tab=all&holding=p-1-short/);
  await expect
    .poll(() => log.calls.some((call) => call.query.includes('variantId=p-1-short')))
    .toBe(true);
  await expect(main(page).getByRole('link', { name: /^#261031-0047/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^#261031-0046/ })).toHaveCount(0);

  const chip = main(page).getByRole('button', { name: /Show every order/ });
  await expect(chip).toContainText('Holding Cotton T-shirt');
  await chip.click();
  await expect(page).toHaveURL(/\/orders\?tab=all$/);
  await expect(main(page).getByRole('link', { name: /^#261031-0046/ })).toBeVisible();
});

test('who may do what on a short row: looking only, no buttons; orders only, See the orders', async ({
  page,
}) => {
  await open(page, '/stock', { isOwner: false, permissions: ['inventory:read'] });
  await expect(main(page)).toContainText('3 held for orders');
  await expect(main(page).getByRole('button', { name: /^Add stock.*short/i })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /^See the orders/ })).toHaveCount(0);

  await open(page, '/stock', { isOwner: false, permissions: ['inventory:read', 'orders:read'] });
  await expect(main(page).getByRole('link', { name: /^See the orders/ })).toBeVisible();
});

test('the combos: what each can make and what limits it, or exactly why it can’t be made', async ({
  page,
}) => {
  await open(page, '/stock');
  const eid = main(page).getByRole('link', { name: /^Eid combo/ });
  await expect(eid).toContainText('Limited by Check lungi · 6 left');
  await expect(eid).toContainText('Can make 6');
  const winter = main(page).getByRole('link', { name: /^Winter combo/ });
  await expect(winter).toContainText('Shawl is archived');
  await expect(winter).toContainText('Can make 0');
  await expect(winter).toHaveAttribute('href', `/${SLUG}/products/p-winter`);
});

test('Home says how many products are short, first, opening Stock', async ({ page }) => {
  await open(page, '', {
    language: 'en',
    home: {
      orders: null,
      stock: { low: 0, out: 0, expiringBatches: 0, short: 2 },
      topUpsBeingChecked: { count: 0, amount: '0.00' },
    },
  });
  const job = main(page).getByRole('link', { name: /2 products short for orders/ });
  await expect(job).toHaveAttribute('href', `/${SLUG}/stock`);
});

test('stock history names a sale’s order, the combo it went in, and a return’s', async ({
  page,
}) => {
  const products = drawnProducts();
  const shirt = products.products[0];
  if (!shirt) throw new Error('p-1');
  const movement = (
    id: number,
    delta: string,
    reason: string,
    order: { id: string; number: string; combo: string | null },
  ) => ({
    id,
    delta,
    onHandAfter: '11',
    reason,
    note: null,
    actor: null,
    createdAt: new Date().toISOString(),
    order,
  });
  shirt.history = {
    'p-1-v3': [
      movement(3, '-1', 'sale', { id: 'o-47', number: '261031-0047', combo: 'Eid combo' }),
      movement(2, '-2', 'sale', { id: 'o-39', number: '261030-0039', combo: null }),
      movement(1, '1', 'return_received', { id: 'o-30', number: '261029-0030', combo: null }),
    ],
  };
  await open(page, '/products/p-1', { products });
  await main(page).getByRole('button', { name: 'Stock history' }).click();
  const sheet = page.getByRole('dialog', { name: 'Stock history' });
  await pickVariant(page, 'M · Black');
  await expect(sheet).toContainText('Sold in "Eid combo" · order #261031-0047');
  await expect(sheet).toContainText('Sold · order #261030-0039');
  await expect(sheet).toContainText('Returned · order #261029-0030');
});
