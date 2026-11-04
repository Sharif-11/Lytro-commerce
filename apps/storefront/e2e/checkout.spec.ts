import { expect, type Page, test } from '@playwright/test';
import { EMBROIDER, GIFT_WRAP, idOf, panjabi, THANA, threePiece, WRAP } from './support/fixtures';
import {
  alertOn,
  fillOrderForm,
  hijabLine,
  openShop,
  panjabiLine,
  seedArea,
  seedCart,
} from './support/shop';

// SFT-06, DLV-06, ORD-02 (Slice 4.8e, the prototype's `checkout`, `confirm-cod`): one page, guest, cash on delivery.

const place = (page: Page) => page.getByRole('button', { name: 'Place order · cash on delivery' });

test.describe('placing an order', () => {
  test('sends what was typed from the storefront, with a key, and shows the order placed', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await seedCart(page, [panjabiLine(), hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await page.getByLabel('A note for the shop (optional)').fill('Call after 2 pm');
    await expect(page.locator('.field .help', { hasText: 'Dhaka city · ৳70' })).toBeVisible();
    await expect(page.locator('.sum .r.total .price')).toHaveText('৳2,020');
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');

    const { orders } = await shop.sent();
    expect(orders).toHaveLength(1);
    const [order] = orders;
    expect(order?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(order?.body).toEqual({
      customerName: 'Rumana Akter',
      phone: '01711223344',
      locationId: THANA.mirpur,
      deliveryAddress: 'House 12/B, Road 3, Mirpur 10',
      shopperNote: 'Call after 2 pm',
      source: 'storefront',
      items: [
        { variantId: idOf('panjabi-M White'), quantity: 1 },
        { variantId: idOf('hijab-Black'), quantity: 2 },
      ],
    });

    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    await expect(
      page.getByText('Order #261031-0047. The shop will call 01711223344 to confirm it.'),
    ).toBeVisible();
    await expect(page.locator('.card2 b')).toHaveText('K7F2M9QX');
    await expect(page.getByRole('link', { name: 'Track the order' })).toHaveAttribute(
      'href',
      '/track/K7F2M9QX',
    );
    await expect(page.getByText('Pay ৳2,020 on delivery')).toBeVisible();
    // No SMS is promised (Phase 7), and the frame is the bare one drawn.
    await expect(page.locator('.page')).not.toContainText('SMS');
    await expect(page.locator('footer.foot')).toHaveCount(0);
    await expect(page.locator('.hdr.minimal')).toBeVisible();

    // The lines have left the cart.
    await page.goto(shop.url('/'));
    await expect(page.locator('.hdr .badge')).toHaveCount(0);
  });

  test('sends add-ons, a combo’s choice and the answers with the line', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [GIFT_WRAP], asked: [EMBROIDER] } })],
    }));
    await seedCart(page, [
      panjabiLine({
        modifiers: [{ groupId: GIFT_WRAP.id, optionIds: [WRAP] }],
        addOns: [{ name: 'Gift wrap', priceChange: '50.00' }],
        answers: [{ attributeId: EMBROIDER.attributeId, name: EMBROIDER.name, value: 'Rafi' }],
      }),
    ]);
    await page.goto(shop.url('/checkout'));
    const line = page.locator('.side .cl');
    await expect(line).toContainText('M · White × 1');
    await expect(line).toContainText('+ Gift wrap ৳50');
    await expect(line).toContainText('Name to embroider: Rafi');
    await expect(line.locator('.price')).toHaveText('৳1,300');
    await fillOrderForm(page);
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');
    const { orders } = await shop.sent();
    expect(orders[0]?.body['items']).toEqual([
      {
        variantId: idOf('panjabi-M White'),
        quantity: 1,
        modifiers: [{ groupId: GIFT_WRAP.id, optionIds: [WRAP] }],
        captured: [{ attributeId: EMBROIDER.attributeId, value: 'Rafi' }],
      },
    ]);
  });

  test("sends a combo's choices", async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [
      {
        variantId: idOf('eid-v'),
        productSlug: 'eid-combo',
        name: 'Eid Combo',
        choice: '',
        price: '1500.00',
        image: null,
        quantity: 2,
        comboPicks: [{ part: 1, variantIds: ['combo-L'] }],
        partsText: 'Cotton Panjabi L, Check lungi',
      },
    ]);
    await page.goto(shop.url('/checkout'));
    await expect(page.locator('.side .cl')).toContainText('Chosen: Cotton Panjabi L, Check lungi');
    await fillOrderForm(page);
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');
    const { orders } = await shop.sent();
    expect(orders[0]?.body['items']).toEqual([
      { variantId: idOf('eid-v'), quantity: 2, choices: [{ part: 1, variantIds: ['combo-L'] }] },
    ]);
  });

  test('tapping twice makes one order (SFT-06)', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    // Both taps in one instant, before the page can grey the button out.
    await place(page).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await page.waitForURL('**/order/K7F2M9QX');
    const sent = await shop.sent();
    expect(sent.orders).toHaveLength(1);
    expect(sent.requests).toBe(1);
  });

  test('trying again after the connection drops makes one order, under the same key (SFT-06)', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({ nextOrders: [{ drop: { placed: true } }] }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await expect(alertOn(page)).toContainText("The order didn't go through");
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rumana Akter');
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');
    const sent = await shop.sent();
    expect(sent.orders).toHaveLength(1);
    expect(sent.requests).toBe(2);
  });

  test('a reload starts a new key (SFT-06)', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [{ refuse: { status: 500, code: 'internal_error' } }],
    }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    const first = page.waitForRequest('**/api/orders');
    await place(page).click();
    const firstKey = (await first).headers()['idempotency-key'];
    await expect(alertOn(page)).toBeVisible();
    await page.reload();
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    const second = page.waitForRequest('**/api/orders');
    await place(page).click();
    expect((await second).headers()['idempotency-key']).not.toBe(firstKey);
    await page.waitForURL('**/order/K7F2M9QX');
  });
});

test.describe('the form', () => {
  test('names what to fix and sends nothing', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await page.getByLabel('Mobile number').fill('0171');
    await place(page).click();
    await expect(alertOn(page)).toHaveText('Fix 4 things');
    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByText('Enter a valid mobile number (01XXXXXXXXX)')).toBeVisible();
    await expect(page.getByText('Pick a thana')).toBeVisible();
    await expect(page.getByText('Address is needed')).toBeVisible();
    expect((await shop.sent()).requests).toBe(0);
    await page.getByLabel('Name', { exact: true }).fill('Rumana');
    await expect(alertOn(page)).toHaveText('Fix 3 things');
  });

  test('shows the server’s refusal of a field on the field', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [
        {
          refuse: {
            status: 422,
            code: 'validation_error',
            details: { fields: [{ field: 'phone', problem: 'invalid_format' }] },
          },
        },
      ],
    }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await expect(page.getByText('Enter a valid mobile number (01XXXXXXXXX)')).toBeVisible();
  });

  test('opens with the area the shopper already set, and a change follows them (SFT-20)', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await seedArea(page, shop, THANA.dhanmondi);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await expect(page.getByLabel('Thana')).toHaveValue(String(THANA.dhanmondi));
    await expect(page.getByLabel('District')).toHaveValue('1');
    await expect(page.locator('.sum .r.total .price')).toHaveText('৳770');
    await page.getByLabel('District').selectOption({ label: 'Gazipur' });
    await expect(page.locator('.sum .r.total .price')).toHaveText(/৳700/);
    await page.getByLabel('Thana').selectOption({ label: 'Tongi' });
    await expect(page.locator('.sum .r.total .price')).toHaveText('৳830');
    const cookies = await page.context().cookies(shop.url('/'));
    expect(cookies.find((cookie) => cookie.name === 'lytro-area')?.value).toBe('12');
  });

  test('before a thana shows the range', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await expect(page.locator('.sum .r.total .price')).toHaveText('৳770 – ৳830');
  });

  test('no delivery to the thana says so and holds the button (DLV-06)', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await page.getByLabel('District').selectOption({ label: 'Bandarban' });
    await page.getByLabel('Thana').selectOption({ label: 'Ruma' });
    await expect(page.getByText('We do not deliver to Bandarban')).toBeVisible();
    await expect(place(page)).toBeDisabled();
  });

  test('never places on the charge of the thana before (SFT-20)', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await page.route('**/api/estimate', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.getByLabel('Thana').selectOption({ label: 'Dhanmondi' });
    await expect(place(page)).toBeDisabled();
    await expect(place(page)).toBeEnabled();
  });
});

test.describe('what the shop refuses', () => {
  test('an item sold out as it was placed: named, out of the total, nothing placed', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [
        { refuse: { status: 409, code: 'conflict', details: { variantId: idOf('hijab-Black') } } },
      ],
    }));
    await seedCart(page, [panjabiLine(), hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await expect(alertOn(page)).toContainText('Chiffon Hijab just sold out');
    await expect(alertOn(page)).toContainText("The order wasn't placed");
    const off = page.locator('.cl.off');
    await expect(off).toContainText('Sold out, not in the total');
    await expect(place(page)).toBeDisabled();
    await expect(page.locator('.sum .r.total .price')).toHaveText('৳1,320');
    expect((await shop.sent()).orders).toHaveLength(0);
    await off.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.cl.off')).toHaveCount(0);
    await expect(alertOn(page)).toHaveCount(0);
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');
    expect((await shop.sent()).orders[0]?.body['items']).toEqual([
      { variantId: idOf('panjabi-M White'), quantity: 1 },
    ]);
  });

  test('an item already sold out when the page checks: named, and Place order waits', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await seedCart(page, [
      hijabLine(),
      {
        ...panjabiLine(),
        variantId: idOf('frock-v'),
        productSlug: 'kids-frock',
        name: 'Kids Frock',
        choice: '',
        price: '690.00',
      },
    ]);
    await page.goto(shop.url('/checkout'));
    await expect(alertOn(page)).toContainText('Kids Frock is sold out');
    await expect(alertOn(page)).toContainText('Remove it to place the order.');
    await expect(place(page)).toBeDisabled();
    await page.locator('.cl.off').getByRole('button', { name: 'Remove' }).click();
    await expect(alertOn(page)).toHaveCount(0);
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
  });

  test('an item needing an advance waits for online payment, with Remove it or Call the shop (D4-2)', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await seedCart(page, [
      hijabLine(),
      {
        ...panjabiLine(),
        variantId: idOf('lawn-L'),
        productSlug: 'lawn-three-piece',
        name: 'Lawn three-piece',
        choice: 'L',
        price: '1850.00',
      },
    ]);
    await page.goto(shop.url('/checkout'));
    await expect(alertOn(page)).toContainText('Lawn three-piece needs a ৳200 advance');
    await expect(alertOn(page)).toContainText("Online payment isn't open yet");
    await expect(page.getByRole('link', { name: 'Call the shop' })).toHaveAttribute(
      'href',
      'tel:01711-223344',
    );
    const off = page.locator('.cl.off');
    await expect(off).toContainText('৳200 advance');
    await expect(place(page)).toBeDisabled();
    // Out of the sum: the hijabs alone.
    await expect(page.locator('.sum .r').first()).toContainText('৳700');
    await page.getByRole('button', { name: 'Remove it' }).click();
    await expect(page.locator('.cl.off')).toHaveCount(0);
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
  });

  test('too many tries says to wait a minute (RTE-06)', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [{ refuse: { status: 429, code: 'rate_limited' } }],
    }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await expect(alertOn(page)).toContainText('Too many tries just now');
    await expect(alertOn(page)).toContainText('Tap again in a minute.');
  });

  test('the server failing keeps everything typed, to tap again', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [{ refuse: { status: 500, code: 'internal_error' } }],
    }));
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await expect(alertOn(page)).toContainText("The order didn't go through");
    await expect(page.getByLabel('Full address')).toHaveValue('House 12/B, Road 3, Mirpur 10');
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');
  });
});

test.describe('around it', () => {
  test('nothing to check out shows the empty cart', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/checkout'));
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Keep shopping' })).toHaveAttribute('href', '/');
    await expect(place(page)).toHaveCount(0);
  });

  test('leaves out what comes later: paying first', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await expect(page.locator('.card2', { hasText: 'Payment' })).toContainText('Cash on delivery');
    await expect(page.getByText('bKash')).toHaveCount(0);
  });

  test('the confirmation opened on another phone names no number (ORD-17)', async ({ page }) => {
    const shop = await openShop(page);
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');
    await page.evaluate(() => {
      sessionStorage.clear();
    });
    await page.reload();
    await expect(
      page.getByText('Order #261031-0047. The shop will call you to confirm it.'),
    ).toBeVisible();
    await expect(page.locator('.page')).not.toContainText('01711223344');
  });

  test('an unknown order’s confirmation is not found', async ({ page }) => {
    const shop = await openShop(page);
    const answer = await page.goto(shop.url('/order/NOSUCHID'));
    expect(answer?.status()).toBe(404);
  });

  test('offers the shop’s app on its home only after a first order (SFT-14)', async ({ page }) => {
    const shop = await openShop(page);
    const offer = () =>
      page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, {
          prompt: () => {
            (window as unknown as { asked: boolean }).asked = true;
            return Promise.resolve();
          },
        });
        window.dispatchEvent(event);
      });
    await seedCart(page, [hijabLine()]);
    await page.goto(shop.url('/'));
    await expect(page.locator('.hdr .shop')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await offer();
    await expect(page.locator('.pwa')).toHaveCount(0);

    await page.goto(shop.url('/checkout'));
    await fillOrderForm(page);
    await expect(place(page)).toBeEnabled();
    await place(page).click();
    await page.waitForURL('**/order/K7F2M9QX');

    await page.goto(shop.url('/'));
    await page.waitForLoadState('networkidle');
    await offer();
    await expect(page.locator('.pwa')).toContainText('Add Megh Fashion to your home screen');
    await page.locator('.pwa').getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.pwa')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { asked?: boolean }).asked)).toBe(true);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await offer();
    await expect(page.locator('.pwa')).toHaveCount(0);
  });

  test('a shop’s checkout is its own: a product needing an advance on a landing page is not', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({ products: [threePiece(language)] }));
    await page.goto(shop.url('/p/lawn-three-piece'));
    await expect(page.locator('.buy .line', { hasText: '৳200 advance' })).toBeVisible();
  });
});
