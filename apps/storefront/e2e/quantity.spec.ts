import { StockUnit } from '@lytronix/validators/enums';
import { expect, test, type Page } from '@playwright/test';
import { idOf, makeProduct, ZONES } from './support/fixtures';
import { alertOn, fillOrderForm, openShop } from './support/shop';

// The Phase 4 close-out (STOREFRONT-DESIGN v1.6): a measured product takes a part of its unit, on its page, on the landing
// page, in the cart and on the order (LND-07, UOM-04); the landing page says where a limited product goes, and a refusal
// names the product (DLV-07).
const rice = (extra: Partial<Parameters<typeof makeProduct>[0]> = {}) =>
  makeProduct({
    id: idOf('rice'),
    slug: 'miniket-rice',
    name: 'Miniket rice',
    price: 80,
    stockUnit: StockUnit.Kg,
    ...extra,
  });

const quantity = (page: Page) => page.getByRole('textbox', { name: 'Quantity' });
const addToCart = (page: Page) =>
  page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true }).last();

test.describe('a measured product (LND-07, UOM-04)', () => {
  test("moves by half a kg, takes any amount typed, and refuses what isn't one", async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({ products: [rice()] }));
    await page.goto(shop.url('/p/miniket-rice'));
    await expect(quantity(page)).toHaveValue('1');
    await expect(page.locator('.qty.measured .u')).toHaveText('kg');
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(quantity(page)).toHaveValue('1.5');
    await page.getByRole('button', { name: '−', exact: true }).click();
    await page.getByRole('button', { name: '−', exact: true }).click();
    await expect(quantity(page)).toHaveValue('0.5');
    await expect(page.getByRole('button', { name: '−', exact: true })).toBeDisabled();

    await quantity(page).fill('0.25');
    await expect(quantity(page)).toHaveValue('0.25');
    await expect(page.locator('.buybar .tot .price, .buybar .price').first()).toContainText('৳20');
    // Not a quantity: nothing changes, and leaving the box shows what still stands.
    for (const wrong of ['0', '-1', '1.2345', 'abc', '100']) {
      await quantity(page).fill(wrong);
      await quantity(page).blur();
      await expect(quantity(page)).toHaveValue('0.25');
    }
  });

  test('goes through the cart and the order as a part of a kg, one thing in the bag', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({ products: [rice()] }));
    await page.goto(shop.url('/p/miniket-rice'));
    await quantity(page).fill('1.5');
    await quantity(page).blur();
    await addToCart(page).click();
    await expect(page.locator('.hdr .badge')).toHaveText('1');
    await page.goto(shop.url('/checkout'));
    await expect(page.locator('.side')).toContainText('× 1.5 kg');
    await fillOrderForm(page);
    await page.getByRole('button', { name: 'Place order · cash on delivery' }).last().click();
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    const { orders } = await shop.sent();
    expect(orders[0]?.body['items']).toEqual([
      expect.objectContaining({ variantId: rice().product.variants[0]?.id, quantity: 1.5 }),
    ]);
  });

  test('g and ml move by the hundred, starting at 100', async ({ page }) => {
    const shop = await openShop(page, () => ({ products: [rice({ stockUnit: StockUnit.G })] }));
    await page.goto(shop.url('/p/miniket-rice'));
    await expect(quantity(page)).toHaveValue('100');
    await expect(page.getByRole('button', { name: '−', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(quantity(page)).toHaveValue('200');
  });

  test('a shared stock sells whole packs, and a piece stays whole', async ({ page }) => {
    const shop = await openShop(page, () => ({
      products: [
        rice({ sharedStock: true, stockUnit: StockUnit.Ml }),
        makeProduct({ id: idOf('soap'), slug: 'soap', name: 'Soap', price: 50 }),
      ],
    }));
    for (const path of ['/p/miniket-rice', '/p/soap']) {
      await page.goto(shop.url(path));
      await expect(page.getByRole('button', { name: '+', exact: true })).toBeVisible();
      await expect(quantity(page)).toHaveCount(0);
    }
  });

  test('the landing page takes 0.5 kg, priced and sent as that', async ({ page }) => {
    const shop = await openShop(page, () => ({ products: [rice()] }));
    await page.goto(shop.url('/l/miniket-rice'));
    await quantity(page).fill('0.5');
    await quantity(page).blur();
    await fillOrderForm(page);
    await expect(page.locator('.side')).toContainText('× 0.5 kg');
    await expect(page.locator('.side .sum')).toContainText('৳40');
    await page.getByRole('button', { name: 'Confirm order' }).first().click();
    await expect(page.getByRole('heading', { name: /order is placed/i })).toBeVisible();
    const { orders } = await shop.sent();
    expect(orders[0]?.body['items']).toEqual([expect.objectContaining({ quantity: 0.5 })]);
  });
});

test.describe('a product limited to some zones (DLV-07)', () => {
  const limited = (zoneId: string) =>
    rice({ stockUnit: StockUnit.Piece, deliveryZoneIds: [zoneId], name: 'Frozen fish' });

  test('the landing page says where it goes, and a refusal names it', async ({ page }) => {
    const inside = ZONES[0]?.id ?? '';
    const shop = await openShop(page, () => ({ products: [limited(inside)] }));
    await page.goto(shop.url('/l/miniket-rice'));
    await expect(page.getByText('Delivers to Dhaka city only')).toBeVisible();
    await page.getByLabel('District').selectOption({ label: 'Gazipur' });
    await page.getByLabel('Thana').selectOption({ label: 'Tongi' });
    await expect(page.getByText("Frozen fish can't be delivered to this address.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm order' }).first()).toBeDisabled();
    await expect(alertOn(page)).toHaveCount(0);
  });

  test('the checkout names it too', async ({ page }) => {
    const inside = ZONES[0]?.id ?? '';
    const shop = await openShop(page, () => ({ products: [limited(inside)] }));
    await page.goto(shop.url('/p/miniket-rice'));
    await addToCart(page).click();
    await page.goto(shop.url('/checkout'));
    await page.getByLabel('District').selectOption({ label: 'Gazipur' });
    await page.getByLabel('Thana').selectOption({ label: 'Tongi' });
    await expect(page.getByText("Frozen fish can't be delivered to this address.")).toBeVisible();
  });
});
