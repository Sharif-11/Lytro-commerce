import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { envelope, mockApi, SLUG, type ApiLog } from './support/mock-api';
import { meghOrders, type OrdersFixture } from './support/orders';

// ORDERS-BEYOND-STOCK (the owner, 2026-11-25; INV-25, OB-9 to OB-12, OB-20; the sketch's `obs-*`): an order taken beyond
// stock waits for it. The list marks it and filters to it; the order says why its next step waits, and adds stock from
// there. Each test runs on a phone and on a desktop.

/** Part 29's day, with Sumaiya's confirmed order short two T-shirts. */
function shortDay(): OrdersFixture {
  const day = meghOrders();
  const sumaiya = day.orders.find((order) => order.id === 'o-44');
  const shirt = sumaiya?.items[0];
  if (!shirt) throw new Error('Part 29 has Sumaiya’s T-shirts');
  shirt.short = 2;
  shirt.productId = 'p-tee';
  return day;
}

async function open(page: Page, path: string): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', orders: shortDay() });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

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

async function expectNoSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(wide).toBe(false);
}

test('the list marks a short order and its chip lists only the orders waiting for stock (OB-11, OB-20)', async ({
  page,
}) => {
  const log = await open(page, '/orders');
  const chip = main(page)
    .getByRole('group')
    .getByRole('button', { name: /^Short of stock/ });
  await expect(chip).toContainText('1');
  await chip.click();
  await expect(main(page).getByRole('link', { name: /^#261031-/ })).toHaveCount(1);
  expect(
    log.calls.some((call) => call.path === '/orders' && call.query.includes('short=yes')),
  ).toBe(true);
  const row = main(page).getByRole('link', { name: /^#261031-0044/ });
  await expect(row).toContainText('Sumaiya Akter');
  await expect(row).toContainText('01922333444');
  await expect(row).toContainText('House 3, Road 2');
  await expect(row).toContainText('2 short');
  await expectAccessible(page);
  await expectNoSideScroll(page);
});

test('a short order says why it waits, greys the step that hands it on, and adds stock from the order (OB-9, OB-12)', async ({
  page,
}) => {
  await open(page, '/orders/o-44');
  await expect(main(page)).toContainText('1 item out of stock');
  await expect(main(page)).toContainText('Add stock before booking a courier or shipping');
  await expect(main(page)).toContainText('Ordered 2, in stock 0');
  await expect(main(page).getByRole('button', { name: 'Mark shipped' })).toBeDisabled();
  await expectAccessible(page);
  await expectNoSideScroll(page);

  await page.route('**/api/v1/products/p-tee/variants/v-0/stock-additions', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ productId: 'p-tee', filledOrders: 2, variants: [] }),
    }),
  );
  await main(page).getByRole('button', { name: 'Add stock' }).first().click();
  const adding = sheet(page, 'Add stock');
  await expect(adding.getByLabel('How many arrived')).toHaveValue('2');
  await expect(adding).toContainText('Older orders waiting for it get the stock first.');
  await expectAccessible(page);
  await adding.getByRole('button', { name: 'Add stock' }).click();
  await expect(page.getByText('Stock given: 2 orders')).toBeVisible();
});
