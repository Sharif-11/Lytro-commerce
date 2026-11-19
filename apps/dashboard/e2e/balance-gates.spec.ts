import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ShopState } from './support/mock-api';

// The owner, 2026-11-19 (the sketch's `bg-*`): "when current balance is not enough to do an action then disable the action
// button with a clear message". Pay-as-you-go's product and order fees, against a mocked balance (rates: ৳10 a product,
// ৳20 or 1.5% an order). Each test runs on a phone and on a desktop.

const main = (page: Page) => page.getByRole('main');

async function open(page: Page, path: string, state: ShopState = {}): Promise<void> {
  await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
}

const payg = (balance: string): ShopState => ({ state: 'pay_as_you_go', money: { balance } });

const addProduct = (page: Page) =>
  page.getByRole('button', { name: 'Add product' }).filter({ visible: true });

test("a product's fee the balance can't cover greys out Add product and a new product's Save, saying why", async ({
  page,
}) => {
  await open(page, '/products', payg('0.50'));
  const note = main(page).getByRole('note');
  await expect(note).toContainText('Balance is not sufficient.');
  await expect(note).toContainText('Adding a product needs ৳10');
  await expect(note).toContainText('the balance holds ৳0.50');
  await expect(note.getByRole('link', { name: 'Top up' })).toHaveAttribute(
    'href',
    `/${SLUG}/balance?topup=1`,
  );
  await expect(addProduct(page)).toBeDisabled();
  await page.goto(`/${SLUG}/products/new`);
  await expect(main(page).getByRole('note')).toContainText('Adding a product needs ৳10');
  // Every Save the editor draws (a computer's top bar has one too).
  const saves = page
    .getByRole('button', { name: 'Save' })
    .and(page.locator('[aria-describedby="new-product-balance"]'));
  await expect(saves.first()).toBeDisabled();
  for (const save of await saves.all()) await expect(save).toBeDisabled();
});

test("an order's next step that takes the order fee waits for it", async ({ page }) => {
  await open(page, '/orders/o-44', payg('3.00'));
  const note = main(page).getByRole('note');
  await expect(note).toContainText('Shipping this order needs ৳');
  await expect(note).toContainText('the balance holds ৳3');
  await expect(
    page.locator('[aria-describedby="order-fee-balance"]').filter({ visible: true }),
  ).toBeDisabled();
});

test('a balance that covers it, a plan with no fees, or someone who may not see the balance: nothing greyed out', async ({
  page,
}) => {
  await open(page, '/products', payg('500.00'));
  await expect(addProduct(page)).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Add product' }).filter({ visible: true }),
  ).toBeEnabled();
  await expect(main(page).getByRole('note')).toHaveCount(0);

  await open(page, '/products', { money: { balance: '0.50' } });
  await expect(main(page).getByRole('note')).toHaveCount(0);

  // Staff who can't read the balance aren't stopped before; the server's refusal says it.
  await open(page, '/products', {
    ...payg('0.50'),
    isOwner: false,
    permissions: ['products:read', 'products:manage'],
  });
  await expect(
    page.getByRole('link', { name: 'Add product' }).filter({ visible: true }),
  ).toBeVisible();
  await expect(main(page).getByRole('note')).toHaveCount(0);
});
