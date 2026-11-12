import { expect, type Page, test } from '@playwright/test';
import type { CartLine } from '../src/lib/cart/cart-store';
import { designed, designedVariant, designPhoto, eidCombo, panjabi } from './support/fixtures';
import { fillOrderForm, hijabLine, openShop, panjabiLine, seedCart } from './support/shop';

// PHOTO-DESIGNS-PLAN §2 on the storefront (STOREFRONT-DESIGN §7f): a product's photos are its designs, chosen by tapping a
// photo, never by a name; the order, the cart and every page after keep that design's photo; the quantity says its unit;
// the cart's trash button and its undo; the highest delivery charge until the address is known.

const cards = (page: Page) => page.locator('.pcards .pcard');
const mainPhoto = (page: Page) => page.locator('.gallery .main img');
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true }).last();
const size = (page: Page, name: string) =>
  page.locator('.buy .vals[aria-label="Size"]').getByRole('button', { name, exact: true });
const cartLines = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('lytro-cart') ?? '[]') as CartLine[]);
const withDesigns =
  (extra: Parameters<typeof designed>[1] = {}) =>
  () => ({
    products: [designed('en', extra), panjabi('en')],
  });

/** Swipes the gallery's photo with a finger, from one side to the other. */
async function swipe(page: Page, from: number, to: number) {
  await page.locator('.gallery .main').evaluate(
    (frame, { start, end }) => {
      const touch = (x: number) =>
        new Touch({ identifier: 1, target: frame, clientX: x, clientY: 200 });
      frame.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [touch(start)],
          changedTouches: [touch(start)],
          bubbles: true,
        }),
      );
      frame.dispatchEvent(
        new TouchEvent('touchend', { touches: [], changedTouches: [touch(end)], bubbles: true }),
      );
    },
    { start: from, end: to },
  );
}

test.describe('choosing a design by its photo (PD-4, PD-5, PD-17)', () => {
  test('offers every design photo as a card, in the gallery order, with nothing chosen and no word on them', async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/irani-burka'));
    await expect(cards(page)).toHaveCount(6);
    for (let at = 0; at < 6; at += 1) {
      await expect(cards(page).nth(at)).toHaveAttribute('aria-label', `Photo ${String(at + 1)}`);
    }
    await expect(cards(page).and(page.locator('[aria-checked="true"]'))).toHaveCount(0);
    // No name, number or "Design" for the shopper; the sold-out design's card says only that.
    await expect(page.locator('.buy')).not.toContainText('Design');
    await expect(cards(page).nth(0)).toHaveText('');
    await expect(cards(page).nth(4)).toHaveText('Sold out');
    await expect(cards(page).nth(4)).toBeDisabled();
    await expect(page.locator('.buy .opt .lb').first()).toContainText('Size');
  });

  test("a tapped photo chooses its design, the gallery shows it, and the cart keeps the design's cover", async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/irani-burka'));
    // The second design's second angle.
    await cards(page).nth(2).click();
    await expect(cards(page).nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(cards(page).nth(2)).toHaveClass(/\bon\b/);
    await expect(cards(page).nth(1)).toHaveClass(/\bsame\b/);
    await expect(mainPhoto(page)).toHaveAttribute('src', designPhoto(2));
    await size(page, 'L').click();
    await button(page, 'Add to cart').click();
    await expect(page.locator('.hdr .badge')).toHaveText('1');
    const [line] = await cartLines(page);
    expect(line?.variantId).toBe(designedVariant(2, 'L'));
    expect(line?.image).toBe(designPhoto(1));
    expect(line?.choice).toBe('L');
  });

  test('buying before choosing scrolls to the cards and shakes them, the buttons keeping their words', async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/irani-burka'));
    await page.locator('.scroll').evaluate((scroller) => {
      scroller.scrollTo({ top: scroller.scrollHeight });
    });
    await button(page, 'Add to cart').click();
    await expect(page.locator('.pcards')).toHaveClass(/\bnudge\b/);
    await expect(page.locator('.pcards')).toBeInViewport();
    await expect(button(page, 'Add to cart')).toBeEnabled();
    expect(await cartLines(page)).toEqual([]);
    // The shake ends, and a second try shakes again.
    await expect(page.locator('.pcards')).not.toHaveClass(/\bnudge\b/);
    if (test.info().project.name === 'desktop') {
      await button(page, 'Buy now').click();
      await expect(page.locator('.pcards')).toHaveClass(/\bnudge\b/);
      expect(new URL(page.url()).pathname).toBe('/p/irani-burka');
    }
    expect(await cartLines(page)).toEqual([]);
  });

  test('swiping the gallery goes round, past the last to the first, and never chooses (PD-5)', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'phone', 'a finger swipes on a phone');
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/irani-burka'));
    await expect(mainPhoto(page)).toHaveAttribute('src', designPhoto(0));
    await swipe(page, 100, 300);
    await expect(mainPhoto(page)).toHaveAttribute('src', designPhoto(5));
    await expect(cards(page).and(page.locator('[aria-checked="true"]'))).toHaveCount(0);
    await cards(page).nth(5).click();
    await swipe(page, 300, 100);
    await expect(mainPhoto(page)).toHaveAttribute('src', designPhoto(0));
    await expect(cards(page).nth(5)).toHaveAttribute('aria-checked', 'true');
  });

  test('a product with one design shows no cards, and that design is chosen (PD-12)', async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns({ designs: [1, 1] }));
    await page.goto(shop.url('/p/irani-burka'));
    await expect(page.locator('.pcards')).toHaveCount(0);
    await button(page, 'Add to cart').click();
    const [line] = await cartLines(page);
    expect(line?.variantId).toBe(designedVariant(1, 'S'));
    expect(line?.image).toBe(designPhoto(0));
  });

  test("a shared link opens on its variant's design and size, the gallery on its cover (PD-24)", async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url(`/p/irani-burka?v=${designedVariant(2, 'XL')}`));
    await expect(cards(page).nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(cards(page).nth(2)).toHaveClass(/\bsame\b/);
    await expect(size(page, 'XL')).toHaveAttribute('aria-pressed', 'true');
    await expect(mainPhoto(page)).toHaveAttribute('src', designPhoto(1));
  });

  test("a combo's choice offers a design by its photo, never its name (ATR-20)", async ({
    page,
  }) => {
    const shop = await openShop(page, () => {
      const combo = eidCombo('en');
      const [part, ...rest] = combo.product.combo?.parts ?? [];
      if (!part || !combo.product.combo) throw new Error('the combo has a choice part');
      const photo = { id: 'cover', urls: { main: designPhoto(1), thumbnail: designPhoto(1) } };
      const parts = [
        { ...part, variants: part.variants.map((each) => ({ ...each, image: photo })) },
        ...rest,
      ];
      return {
        products: [
          { ...combo, product: { ...combo.product, combo: { ...combo.product.combo, parts } } },
        ],
      };
    });
    await page.goto(shop.url('/p/eid-combo'));
    const chip = page
      .locator('.combo .vals')
      .first()
      .getByRole('button', { name: 'M', exact: true });
    await expect(chip.locator('img')).toHaveAttribute('src', designPhoto(1));
  });
});

test.describe('the chosen design after ordering (PD-6, PD-7)', () => {
  test("checkout, the order sent, the confirmation and tracking all carry the design's cover and no name", async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/irani-burka'));
    await cards(page).nth(2).click();
    await size(page, 'M').click();
    await button(page, 'Add to cart').click();
    await page.goto(shop.url('/checkout'));
    const summary = page.locator('.side .cl').first();
    await expect(summary.locator('img')).toHaveAttribute('src', designPhoto(1));
    await expect(summary).toContainText('M × 1 piece');
    await expect(page.locator('.side')).not.toContainText('Design');
    await fillOrderForm(page);
    await page.getByRole('button', { name: 'Place order · cash on delivery' }).click();
    await page.waitForURL('**/order/K7F2M9QX');
    const { orders } = await shop.sent();
    const items = orders[0]?.body['items'] as { variantId: string }[];
    expect(items.map((item) => item.variantId)).toEqual([designedVariant(2, 'M')]);

    const placed = page.locator('.placed .cl').first();
    await expect(placed.locator('img')).toHaveAttribute('src', designPhoto(1));
    await expect(placed).toContainText('M × 1 piece');
    await expect(page.locator('.placed')).not.toContainText('Design');

    await page.goto(shop.url('/track/K7F2M9QX'));
    const tracked = page.locator('.side .cl').first();
    await expect(tracked.locator('img')).toHaveAttribute('src', designPhoto(1));
    await expect(tracked).toContainText('M × 1 piece');
    await expect(page.locator('.side')).not.toContainText('Design');
  });
});

test.describe('the landing page (PD-4, PD-6, PD-25)', () => {
  test('takes a design by its photo, shows its cover in the summary, and the highest charge until a thana', async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/l/irani-burka'));
    await page.getByRole('button', { name: 'Confirm order' }).click();
    await expect(page.locator('.pcards')).toHaveClass(/\bnudge\b/);
    await cards(page).nth(3).click();
    const summary = page.locator('.side .cl');
    await expect(summary.locator('img')).toHaveAttribute('src', designPhoto(3));
    await expect(summary.locator('.vr')).toHaveText('S × 1 piece');
    const delivery = page.locator('.side .sum .r').nth(1);
    await expect(delivery).toContainText('৳130');
    await expect(page.locator('.side .sum')).toContainText(
      'Choose your thana to see the exact delivery charge',
    );
    await expect(page.locator('.side .sum .r.total .price')).toHaveText('৳1,380');
    await fillOrderForm(page);
    await expect(delivery).toContainText('৳70');
    await expect(page.locator('.side .sum')).not.toContainText('Choose your thana');
    await expect(page.locator('.side .sum .r.total .price')).toHaveText('৳1,320');
    await page.getByRole('button', { name: 'Confirm order' }).click();
    await expect(page.getByText('Thank you! Your order is placed')).toBeVisible();
    const { orders } = await shop.sent();
    const items = orders[0]?.body['items'] as { variantId: string }[];
    expect(items.map((item) => item.variantId)).toEqual([designedVariant(3, 'S')]);
    await expect(page.locator('.placed .cl img')).toHaveAttribute('src', designPhoto(3));
  });
});

test.describe('the quantity says its unit (PD-19, UOM-05)', () => {
  test('on the product page and in the cart, in English', async ({ page }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/cotton-panjabi'));
    const stepper = page.locator('.buy .qty').first();
    await expect(stepper).toContainText('1 piece');
    await stepper.getByRole('button', { name: '+' }).click();
    await expect(stepper).toContainText('2 pieces');
    await button(page, 'Add to cart').click();
    await page.goto(shop.url('/cart'));
    await expect(page.getByRole('dialog').locator('.cl .qty')).toContainText('2 pieces');
  });

  test('and in Bangla, one word whatever the count', async ({ page }) => {
    const shop = await openShop(page, (language) => ({ products: [panjabi(language)] }), 'bn');
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.locator('.buy .qty').first()).toContainText('1 পিস');
  });
});

test.describe('the cart (PD-21, PD-25, PD-26)', () => {
  const held = (): CartLine[] => [
    panjabiLine(),
    {
      variantId: designedVariant(2, 'L'),
      productSlug: 'irani-burka',
      name: 'Cotton Panjabi',
      choice: 'L',
      price: '1250.00',
      image: designPhoto(1),
      quantity: 1,
    },
    hijabLine(),
  ];

  test('each line has its photo and a trash button beside its quantity; removing says so, with Undo', async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await seedCart(page, held());
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    const lines = cart.locator('.cl');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(1).locator('img.th')).toHaveAttribute('src', designPhoto(1));
    const trash = lines.nth(1).locator('.qrm').getByRole('button', { name: 'Remove' });
    await expect(lines.nth(1).locator('.qrm .qty')).toBeVisible();
    const box = await trash.boundingBox();
    expect(box?.width).toBeCloseTo(34, 0);
    expect(box?.height).toBeCloseTo(34, 0);
    await expect(cart.getByText('Remove', { exact: true })).toHaveCount(0);

    await trash.click();
    await expect(lines).toHaveCount(2);
    const toast = page.getByRole('status').filter({ hasText: 'Removed from your cart' });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(lines).toHaveCount(3);
    expect((await cartLines(page)).map((line) => line.variantId)).toEqual(
      held().map((line) => line.variantId),
    );

    await lines.nth(0).getByRole('button', { name: 'Remove' }).click();
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 7000 });
    await expect(lines).toHaveCount(2);
  });

  test("shows the shop's highest charge and one total until the address is set, then the exact one", async ({
    page,
  }) => {
    const shop = await openShop(page, withDesigns());
    await seedCart(page, [panjabiLine()]);
    await page.goto(shop.url('/cart'));
    const cart = page.getByRole('dialog');
    await expect(cart.locator('.sum .r').nth(1)).toContainText('৳130');
    await expect(cart.locator('.sum .r.total .price')).toHaveText('৳1,380');
    await cart
      .getByRole('button', { name: 'Set your address to see the exact delivery charge' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Your address' });
    await sheet.getByLabel('District').selectOption({ label: 'Dhaka' });
    await sheet.getByLabel('Thana').selectOption({ label: 'Mirpur' });
    await sheet.getByRole('button', { name: 'Set address' }).click();
    await expect(cart.getByText('Delivery · Dhaka city')).toBeVisible();
    await expect(cart.locator('.sum .r.total .price')).toHaveText('৳1,320');
    await expect(cart.getByText('Set your address to see the exact delivery charge')).toHaveCount(
      0,
    );
  });

  test("asks for the shopper's address in those words on the product page", async ({ page }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/cotton-panjabi'));
    await expect(page.getByRole('button', { name: 'Set your address', exact: true })).toBeVisible();
  });
});

test.describe("the gallery's shape (PD-18, PD-28)", () => {
  test("takes the first photo's shape, and on a computer the window's height", async ({ page }) => {
    const shop = await openShop(page, withDesigns());
    await page.goto(shop.url('/p/irani-burka'));
    const frame = await page.locator('.gallery .main').boundingBox();
    if (!frame) throw new Error('the gallery is drawn');
    expect(frame.width / frame.height).toBeCloseTo(2 / 3, 2);
    if (test.info().project.name === 'desktop') {
      const window = page.viewportSize();
      expect(frame.height).toBeCloseTo(Math.min((window?.height ?? 0) - 150, 800), 0);
      expect(frame.y + frame.height).toBeLessThanOrEqual(window?.height ?? 0);
    }
    // A product whose photo sizes aren't known keeps the drawn 4:5.
    await page.goto(shop.url('/p/cotton-panjabi'));
    const plain = await page.locator('.gallery .main').boundingBox();
    expect((plain?.width ?? 0) / (plain?.height ?? 1)).toBeCloseTo(0.8, 2);
  });
});
