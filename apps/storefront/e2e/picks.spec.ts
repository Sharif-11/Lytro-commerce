import { AttributeDataType } from '@lytronix/validators/enums';
import { expect, type Page, test } from '@playwright/test';
import { EMBROIDER, GIFT_WRAP, idOf, PACKING, panjabi, THANA, WRAP } from './support/fixtures';
import { alertOn, hijabLine, openShop, panjabiLine, seedArea, seedCart } from './support/shop';

// MNU-01, MNU-02, ATR-08, CMB-09, SFT-05 (Slice 4.8e): what a shopper picks with a product, kept on its cart line, and the
// cart that checks it all against the shop.

const addButton = (page: Page) =>
  page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true }).last();

async function openCart(page: Page) {
  await page.locator('.hdr').getByRole('button', { name: 'Cart' }).click();
  return page.getByRole('dialog');
}

test.describe('add-ons', () => {
  test('each group says its rule, its price joins the total, and it stays on the line', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [GIFT_WRAP] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.getByText('Add-ons · Gift wrap')).toBeVisible();
    await expect(page.getByText('Optional · at most 1')).toBeVisible();
    const wrap = page.getByRole('radio', { name: /Gift wrap/ });
    await expect(wrap).toHaveAttribute('aria-checked', 'false');
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-checked', 'true');
    if (test.info().project.name === 'phone') {
      await expect(page.locator('.buybar .price')).toHaveText('৳1,300');
    }
    await addButton(page).click();
    await page.getByRole('button', { name: 'View cart' }).click();
    const cart = page.getByRole('dialog');
    await expect(cart.locator('.cl')).toContainText('+ Gift wrap ৳50');
    await expect(cart.locator('.cl .price')).toHaveText('৳1,300');
    await expect(cart.locator('.r').first()).toContainText('৳1,300');
  });

  test('taps again to clear an optional one', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [GIFT_WRAP] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    const wrap = page.getByRole('radio', { name: /Gift wrap/ });
    await wrap.click();
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-checked', 'false');
  });

  test('a required group left empty says so and adds nothing; picked, it goes in', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [PACKING] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.getByText('Pick 1', { exact: true })).toBeVisible();
    await addButton(page).click();
    await expect(alertOn(page)).toHaveText('Pick one');
    // The cart's count, not the toast: a toast that came would be gone again by the end of a retry.
    await expect(page.locator('.hdr .badge')).toHaveCount(0);
    await page.getByRole('radio', { name: /Gift box/ }).click();
    await addButton(page).click();
    await expect(page.getByRole('status')).toContainText('Added to cart');
    await expect(alertOn(page)).toHaveCount(0);
  });

  test('two different picks of one variant are two lines; the same again is one', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [GIFT_WRAP] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await addButton(page).click();
    await page.getByRole('radio', { name: /Gift wrap/ }).click();
    await addButton(page).click();
    await addButton(page).click();
    const cart = await openCart(page);
    await expect(cart.locator('.cl')).toHaveCount(2);
    await expect(cart.locator('.cl').nth(0).locator('.qty span')).toHaveText('1');
    await expect(cart.locator('.cl').nth(1).locator('.qty span')).toHaveText('2');
    await expect(cart.locator('.cl').nth(1).locator('.price')).toHaveText('৳2,600');
  });
});

test.describe('what the shop asks (ATR-08)', () => {
  test('sits above Add to cart, optional, and the answer stays on the line', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { asked: [EMBROIDER] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    const asked = page.getByLabel('Name to embroider (optional)');
    await asked.fill('Rafi');
    await addButton(page).click();
    await page.getByRole('button', { name: 'View cart' }).click();
    await expect(page.getByRole('dialog').locator('.cl')).toContainText('Name to embroider: Rafi');
  });

  test('takes no answer at all, and keeps nothing for one left blank', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { asked: [EMBROIDER] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await addButton(page).click();
    await page.getByRole('button', { name: 'View cart' }).click();
    await expect(page.getByRole('dialog').locator('.cl')).not.toContainText('Name to embroider');
  });

  test('holds a number asked to being one', async ({ page }) => {
    const age = { attributeId: 'age', name: 'Age', dataType: AttributeDataType.NumberWithUnit };
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { asked: [age] } })],
    }));
    await page.goto(shop.url('/p/cotton-panjabi'));
    await page.getByLabel('Age (optional)').fill('twelve');
    await expect(page.getByText('Numbers only')).toBeVisible();
    await addButton(page).click();
    await expect(page.locator('.hdr .badge')).toHaveCount(0);
    await page.getByLabel('Age (optional)').fill('12');
    await expect(page.getByText('Numbers only')).toHaveCount(0);
    await addButton(page).click();
    await expect(page.getByRole('status')).toContainText('Added to cart');
  });
});

test.describe('a combo (CMB-09)', () => {
  test("shows what's inside and what it saves, strikes what is sold out, and keeps the choice", async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/p/eid-combo'));
    await expect(page.getByText("What's inside")).toBeVisible();
    await expect(page.locator('.pricerow .unit')).toHaveText('৳1,670');
    await expect(page.locator('.pricerow')).toContainText('Save ৳170');
    await expect(page.getByText('Comes with')).toBeVisible();
    await expect(page.getByRole('button', { name: 'XXL' })).toBeDisabled();
    await page.getByRole('button', { name: 'L', exact: true }).click();
    await expect(page.getByRole('button', { name: 'L', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await addButton(page).click();
    await page.getByRole('button', { name: 'View cart' }).click();
    await expect(page.getByRole('dialog').locator('.cl')).toContainText(
      'Chosen: Cotton Panjabi L, Check lungi',
    );
  });

  test('sold out when a part cannot be had, without a price on its parts', async ({ page }) => {
    const shop = await openShop(page, (language) => {
      const fixture = {
        ...panjabi(language),
      };
      return {
        products: [
          {
            ...fixture,
            product: {
              ...fixture.product,
              combo: {
                saving: null,
                parts: [
                  {
                    position: 1,
                    quantity: '1.000',
                    productName: 'Lungi',
                    image: null,
                    choice: false,
                    variants: [
                      { variantId: 'x', productName: 'Lungi', label: '', available: false },
                    ],
                  },
                ],
              },
            },
          },
        ],
      };
    });
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.locator('.pricerow .st.out')).toHaveText('Sold out');
    await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });
});

test.describe('Buy now', () => {
  test('goes straight to checkout with the item', async ({ page }) => {
    test.skip(test.info().project.name === 'phone', "a phone's bar has Add to cart only, as drawn");
    const shop = await openShop(page);
    await page.goto(shop.url('/p/chiffon-hijab'));
    await page.getByRole('button', { name: 'Buy now' }).click();
    await page.waitForURL('**/checkout');
    await expect(page.getByRole('heading', { name: 'Order summary' })).toBeVisible();
    await expect(page.locator('.side .cl')).toContainText('Chiffon Hijab');
  });
});

test.describe('the cart (SFT-05, SFT-20)', () => {
  test('shows the exact charge and the tax it includes once the area is set', async ({ page }) => {
    const shop = await openShop(page);
    await seedArea(page, shop, THANA.mirpur);
    await seedCart(page, [panjabiLine(), hijabLine()]);
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    await expect(cart.getByText('Delivery · Dhaka city')).toBeVisible();
    await expect(cart.locator('.r.total .price')).toHaveText('৳2,020');
    await expect(cart.getByText('Includes VAT 5%')).toBeVisible();
    await expect(cart.locator('.r', { hasText: 'Includes VAT' })).toContainText('৳92.85');
  });

  test('before an area shows the range, and Checkout leads on', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [panjabiLine()]);
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    await expect(cart.locator('.r.total .price')).toHaveText('৳1,320 – ৳1,380');
    await expect(cart.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout');
    await expect(cart.getByText('Online ordering opens soon')).toHaveCount(0);
  });

  test('blocks Checkout where the shop does not deliver, with its phone (DLV-06)', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await seedArea(page, shop, THANA.ruma);
    await seedCart(page, [panjabiLine()]);
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    await expect(cart.getByText('We do not deliver to Bandarban')).toBeVisible();
    await expect(cart.getByText('call 01711-223344')).toBeVisible();
    await expect(cart.getByRole('button', { name: 'Checkout' })).toBeDisabled();
  });

  test('checks each line: a new price, sold out, no longer sold, options that no longer fit', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await seedCart(page, [
      panjabiLine({ price: '1150.00' }),
      {
        ...panjabiLine(),
        variantId: idOf('frock-v'),
        productSlug: 'kids-frock',
        name: 'Kids Frock',
        choice: '',
        price: '690.00',
      },
      {
        ...panjabiLine(),
        variantId: idOf('gone-v'),
        productSlug: 'gone',
        name: 'Old Scarf',
        choice: '',
        price: '300.00',
      },
      hijabLine({
        modifiers: [{ groupId: idOf('no-such-group'), optionIds: [idOf('x')] }],
        addOns: [{ name: 'Tassels', priceChange: '20.00' }],
      }),
    ]);
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    await expect(cart.locator('.cl').nth(0)).toContainText('Price changed, was ৳1,150');
    await expect(cart.locator('.cl').nth(0).locator('.price')).toHaveText('৳1,250');
    await expect(cart.locator('.cl.off').nth(0)).toContainText('Sold out, not in the total');
    await expect(cart.locator('.cl.off').nth(1)).toContainText('No longer sold, not in the total');
    await expect(cart.locator('.cl.off').nth(2)).toContainText('Its options changed');
    await expect(cart.locator('.r').first()).toContainText('৳1,250');
    await expect(cart.locator('.r').first()).toContainText('1 item');
  });

  test('the stepper and Remove work a line by its own picks', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [GIFT_WRAP] } })],
    }));
    await seedCart(page, [
      panjabiLine(),
      panjabiLine({
        modifiers: [{ groupId: GIFT_WRAP.id, optionIds: [WRAP] }],
        addOns: [{ name: 'Gift wrap', priceChange: '50.00' }],
      }),
    ]);
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    const wrapped = cart.locator('.cl', { hasText: 'Gift wrap' });
    await wrapped.getByRole('button', { name: '+' }).click();
    await expect(wrapped.locator('.price')).toHaveText('৳2,600');
    await expect(cart.locator('.cl').first().locator('.qty span')).toHaveText('1');
    await cart.locator('.cl').first().getByRole('button', { name: 'Remove' }).click();
    await expect(cart.locator('.cl')).toHaveCount(1);
    await expect(cart.locator('.cl')).toContainText('Gift wrap');
  });
});
