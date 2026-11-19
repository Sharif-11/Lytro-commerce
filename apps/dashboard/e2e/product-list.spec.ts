import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// STOREFRONT-BUILDER-PLAN DC-2, DC-6 to DC-8: the design page's "Products in your shop" switch, and the Product list --
// the shop's cards in its default order, moved by a handle dragged on a phone or a computer, by arrows and to the top or
// bottom, each product with designs shown as its designs, one card or both, saved with Save order. Each test runs on a
// phone and a desktop (playwright.config.ts).

const LIST = '/settings/storefront/design/products';

async function open(page: Page, path = LIST, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

const isDesktop = () => test.info().project.name === 'desktop';

/** The cards as this screen size shows them: the computer's grid, or the phone's list. */
function cards(page: Page): Locator {
  return page
    .getByRole('main')
    .locator(isDesktop() ? '.lg\\:flex [data-drag-at]' : 'ul [data-drag-at]');
}

async function names(page: Page): Promise<string[]> {
  return (await cards(page).all()).length === 0
    ? []
    : cards(page).evaluateAll((each) =>
        each.map((card) => {
          const name = card.querySelector('b, .truncate')?.textContent ?? '';
          const line = card.textContent;
          const design = /Design (\d)|All (\d) designs/.exec(line);
          return design ? `${name} ${design[0]}` : name;
        }),
      );
}

const saved = (log: ApiLog) =>
  log.sent('PUT', '/storefront/design/cards/order') as
    { cards: { productId: string; designId: string | null }[]; modes: unknown[] } | undefined;

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('iframe')
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('the design page turns design cards off at once, and opens the Product list', async ({
  page,
}) => {
  const log = await open(page, '/settings/storefront/design');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Products in your shop' })).toBeVisible();
  const toggle = main.getByRole('switch', { name: 'Each design as its own card' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByText('Each product now shows as one card')).toBeVisible();
  expect(log.sent('PUT', '/storefront/design/cards/designs')).toEqual({ on: false });
  await main.getByRole('link', { name: 'Product list' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}${LIST}$`));
});

test('lists every card in the shop order, hidden and sold-out ones marked, the compact card not shown', async ({
  page,
}) => {
  await open(page);
  await expect(cards(page)).toHaveCount(7);
  expect(await names(page)).toEqual([
    'Embroidered panjabi',
    'Printed shirt Design 1',
    'Chikankari kurti',
    'Printed shirt Design 2',
    'Cotton saree',
    'Printed shirt Design 3',
    'Linen panjabi',
  ]);
  await expect(cards(page).nth(5)).toContainText('Sold out');
  await expect(cards(page).nth(6)).toContainText('Hidden');
  await expect(page.getByRole('button', { name: 'Save order' })).toBeDisabled();
  await expectAccessible(page);
});

test('drags a card by its handle to a new place, and saves the order', async ({ page }) => {
  const log = await open(page);
  const handle = page
    .getByRole('main')
    .getByRole('button', { name: 'Drag Cotton saree' })
    .locator('visible=true');
  const target = cards(page).nth(0);
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('both on screen');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  expect((await names(page))[0]).toBe('Cotton saree');
  await expect(page.getByText(/\d moved/).locator('visible=true')).toBeVisible();
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page.getByText('Order saved. Shoppers see it within a minute.')).toBeVisible();
  expect(saved(log)?.cards[0]).toEqual({ productId: 'p-saree', designId: null });
  await expect(page.getByRole('button', { name: 'Save order' })).toBeDisabled();
});

test('moves with the keyboard and the menu, and shows a product as one card or both (DC-8)', async ({
  page,
}) => {
  const log = await open(page);
  const main = page.getByRole('main');
  // The keyboard on a handle moves its card one place.
  await main
    .getByRole('button', { name: 'Drag Chikankari kurti' })
    .locator('visible=true')
    .press('ArrowUp');
  expect((await names(page)).slice(1, 3)).toEqual(['Chikankari kurti', 'Printed shirt Design 1']);

  await main
    .getByRole('button', { name: 'More for Linen panjabi' })
    .locator('visible=true')
    .click();
  await page.getByRole('menuitem', { name: 'Move to top' }).click();
  expect((await names(page))[0]).toBe('Linen panjabi');

  await main
    .getByRole('button', { name: 'More for Printed shirt, Design 2' })
    .locator('visible=true')
    .click();
  await expect(page.getByRole('menuitemradio', { name: 'Each design a card' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('menuitemradio', { name: 'Both' }).click();
  // The shirt's one card shows, on a ground of its own.
  const compact = cards(page).filter({ hasText: 'All 3 designs' });
  await expect(compact).toHaveCount(1);
  await expect(compact).toHaveClass(/bg-primary-soft/);
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page.getByText('Order saved. Shoppers see it within a minute.')).toBeVisible();
  expect(saved(log)?.modes).toEqual([{ productId: 'p-shirt', mode: 'both' }]);
  expect(saved(log)?.cards).toContainEqual({ productId: 'p-shirt', designId: null });
});

test('leaving with the order unsaved asks first', async ({ page }) => {
  await open(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Drag Cotton saree' })
    .locator('visible=true')
    .press('ArrowUp');
  // Away inside the app: the phone's back arrow, the computer's Settings in the side column.
  await (
    isDesktop()
      ? page.getByRole('link', { name: 'Settings', exact: true }).first()
      : page.getByRole('link', { name: 'Back' })
  ).click();
  await expect(page.getByRole('dialog')).toContainText('Your new order isn’t saved yet.');
});

test('reads in Bangla', async ({ page }) => {
  await open(page, LIST, { language: 'bn' });
  await expect(
    page
      .getByRole('main')
      .getByText('কার্ড খুঁজুন')
      .or(page.getByPlaceholder('কার্ড খুঁজুন'))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'ক্রম সেভ করুন' })).toBeDisabled();
});
