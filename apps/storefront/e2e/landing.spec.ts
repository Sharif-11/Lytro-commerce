import { expect, type Page, test } from '@playwright/test';
import {
  EMBROIDER,
  GIFT_WRAP,
  idOf,
  PACKING,
  panjabi,
  THANA,
  threePiece,
  WRAP,
} from './support/fixtures';
import { alertOn, fillOrderForm, openShop } from './support/shop';

// LND-06 to LND-12, LND-15, LND-18 (Slice 4.8e): the landing page's form takes the order, without leaving the page, and
// tells the shop's Meta Pixel.

const confirm = (page: Page) => page.getByRole('button', { name: 'Confirm order' });

const PIXEL = '1234567890';

/** Holds Meta's script back, as a phone on a slow line would, so the calls stay in the queue to read. */
async function stubPixelScript(page: Page): Promise<{ requested: () => number }> {
  let requests = 0;
  await page.route('https://connect.facebook.net/**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  return { requested: () => requests };
}

interface PixelCall {
  name: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}

function pixelCalls(page: Page): Promise<PixelCall[]> {
  return page.evaluate(() => {
    const held = (window as unknown as { fbq?: { queue: unknown[][] } }).fbq?.queue ?? [];
    return held
      .filter((call) => call[0] === 'track')
      .map((call) => ({
        name: call[1] as string,
        data: (call[2] ?? {}) as Record<string, unknown>,
        options: call[3] as Record<string, unknown> | undefined,
      }));
  });
}

async function eventNamed(page: Page, name: string): Promise<PixelCall | undefined> {
  return (await pixelCalls(page)).find((call) => call.name === name);
}

test.describe('the order', () => {
  test('is placed without leaving the page, from the landing page, and confirmed there', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await page.getByLabel('Comments (optional)').fill('Call first');
    await expect(page.locator('.side .sum .r.total .price')).toHaveText('৳1,320');
    await expect(page.locator('.side .sum')).toContainText('Delivery · Dhaka city');
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();

    await expect(
      page.getByRole('heading', { name: 'Thank you! Your order is placed' }),
    ).toBeVisible();
    expect(page.url()).toBe(shop.url('/l/cotton-panjabi'));
    await expect(
      page.getByText('Order #261031-0047. The shop will call 01711223344 to confirm it.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Track the order' })).toHaveAttribute(
      'href',
      '/track/K7F2M9QX',
    );
    await expect(page.locator('footer.foot')).toBeHidden();
    await expect(page.locator('.buybar')).toHaveCount(0);

    const { orders } = await shop.sent();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.body).toEqual({
      customerName: 'Rumana Akter',
      phone: '01711223344',
      locationId: THANA.mirpur,
      deliveryAddress: 'House 12/B, Road 3, Mirpur 10',
      shopperNote: 'Call first',
      source: 'landing_page',
      items: [{ variantId: idOf('panjabi-M White'), quantity: 1 }],
    });
  });

  test('takes the variant a link names, and the quantity picked (LND-06, LND-08)', async ({
    page,
  }) => {
    const shop = await openShop(page);
    await page.goto(shop.url(`/l/cotton-panjabi?v=${idOf('panjabi-XL Navy')}`));
    await expect(page.locator('.side .cl .vr')).toHaveText('XL · Navy × 1');
    await page.locator('.buy .qty').getByRole('button', { name: '+' }).click();
    await expect(page.locator('.side .cl .vr')).toHaveText('XL · Navy × 2');
    await fillOrderForm(page);
    await expect(page.locator('.side .sum .r.total .price')).toHaveText('৳2,570');
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    expect((await shop.sent()).orders[0]?.body['items']).toEqual([
      { variantId: idOf('panjabi-XL Navy'), quantity: 2 },
    ]);
  });

  test('asks the same add-ons and questions, priced in, and sends them', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [GIFT_WRAP], asked: [EMBROIDER] } })],
    }));
    await page.goto(shop.url('/l/cotton-panjabi'));
    await page.getByRole('radio', { name: /Gift wrap/ }).click();
    await page.getByLabel('Name to embroider (optional)').fill('Rafi');
    await expect(page.locator('.side .cl')).toContainText('+ Gift wrap ৳50');
    await expect(page.locator('.side .cl')).toContainText('Name to embroider: Rafi');
    await fillOrderForm(page);
    await expect(page.locator('.side .sum .r.total .price')).toHaveText('৳1,370');
    await expect(page.locator('.side .sum').getByText('Includes VAT 5%')).toBeVisible();
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    expect((await shop.sent()).orders[0]?.body['items']).toEqual([
      {
        variantId: idOf('panjabi-M White'),
        quantity: 1,
        modifiers: [{ groupId: GIFT_WRAP.id, optionIds: [WRAP] }],
        captured: [{ attributeId: EMBROIDER.attributeId, value: 'Rafi' }],
      },
    ]);
  });

  test('takes a combo with its choice', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/eid-combo'));
    await page.getByRole('button', { name: 'XL', exact: true }).click();
    await expect(page.locator('.side .cl')).toContainText('Chosen: Cotton Panjabi XL, Check lungi');
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    expect((await shop.sent()).orders[0]?.body['items']).toEqual([
      { variantId: idOf('eid-v'), quantity: 1, choices: [{ part: 1, variantIds: ['combo-XL'] }] },
    ]);
  });

  test('a required add-on left empty stops it, saying so by the add-on', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      products: [panjabi(language, { extra: { modifierGroups: [PACKING] } })],
    }));
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByText('Pick one', { exact: true })).toBeVisible();
    expect((await shop.sent()).requests).toBe(0);
  });

  test('tapping twice makes one order (LND-09)', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    expect((await shop.sent()).requests).toBe(1);
  });

  test('a storefront switched off still takes a landing page’s order (LND-02)', async ({
    page,
  }) => {
    const shop = await openShop(page, () => ({ storefrontEnabled: false }));
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    await page.getByRole('link', { name: 'Track the order' }).click();
    await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
  });
});

test.describe('what the form refuses', () => {
  test('names what to fix and sends nothing (LND-07)', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await page.getByLabel('Mobile number').fill('0171');
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(alertOn(page)).toHaveText('Fix 4 things');
    await expect(page.getByText('Pick a thana')).toBeVisible();
    await expect(page.getByText('Address is needed')).toBeVisible();
    expect((await shop.sent()).requests).toBe(0);
  });

  test('no delivery to the thana holds the button (DLV-06)', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await page.getByLabel('District').selectOption({ label: 'Bandarban' });
    await page.getByLabel('Thana').selectOption({ label: 'Ruma' });
    await expect(page.getByText('We do not deliver to Bandarban')).toBeVisible();
    await expect(confirm(page)).toBeDisabled();
  });

  test('a product needing an advance waits for online payment, with Call the shop (D4-2)', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({ products: [threePiece(language)] }));
    await page.goto(shop.url('/l/lawn-three-piece'));
    await expect(alertOn(page)).toContainText('Lawn three-piece needs a ৳200 advance');
    await expect(page.getByRole('link', { name: 'Call the shop' })).toBeVisible();
    await expect(confirm(page)).toBeDisabled();
  });

  test('a sold-out product says so where the button is', async ({ page }) => {
    const shop = await openShop(page);
    await page.goto(shop.url('/l/kids-frock'));
    await expect(page.locator('.side').getByRole('button', { name: 'Sold out' })).toBeDisabled();
  });

  test('an item sold out as it was placed says so, nothing placed', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [
        {
          refuse: {
            status: 409,
            code: 'conflict',
            details: { variantId: idOf('panjabi-M White') },
          },
        },
      ],
    }));
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(alertOn(page)).toContainText('Cotton Panjabi just sold out');
    expect((await shop.sent()).orders).toHaveLength(0);
  });

  test('too many tries says to wait a minute (LND-12)', async ({ page }) => {
    const shop = await openShop(page, () => ({
      nextOrders: [{ refuse: { status: 429, code: 'rate_limited' } }],
    }));
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(alertOn(page)).toContainText('Too many tries just now');
  });
});

test.describe('the Meta Pixel (LND-15, LND-16, LND-18)', () => {
  const withPixel = () => ({
    info: {
      name: 'Megh Fashion',
      slug: 'megh',
      metaPixelId: PIXEL,
      logo: null,
      contact: { phone: '01711-223344', email: null, address: null },
      deliveryZones: [
        {
          id: 'inside',
          name: { bn: 'ঢাকা শহর', en: 'Dhaka city' },
          charge: '70.00',
          noDelivery: false,
        },
      ],
      brand: null,
    },
  });

  test('fires ViewContent on opening, InitiateCheckout once at the first field', async ({
    page,
  }) => {
    await stubPixelScript(page);
    const shop = await openShop(page, withPixel);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await expect.poll(() => eventNamed(page, 'ViewContent')).toBeTruthy();
    expect((await pixelCalls(page)).map((call) => call.name)).toEqual(['PageView', 'ViewContent']);
    // LND-15: the product, its value and currency, by the IDs the catalog feed lists.
    expect(await eventNamed(page, 'ViewContent')).toMatchObject({
      data: {
        content_ids: expect.arrayContaining([idOf('panjabi-M White')]) as string[],
        content_type: 'product',
        currency: 'BDT',
        value: 1250,
      },
    });

    await page.getByLabel('Name', { exact: true }).focus();
    await expect.poll(() => eventNamed(page, 'InitiateCheckout')).toBeTruthy();
    expect(await eventNamed(page, 'InitiateCheckout')).toMatchObject({
      data: {
        content_ids: [idOf('panjabi-M White')],
        content_type: 'product',
        currency: 'BDT',
        value: 1250,
      },
    });
    await page.getByLabel('Mobile number').focus();
    const calls = await pixelCalls(page);
    expect(calls.filter((call) => call.name === 'InitiateCheckout')).toHaveLength(1);
  });

  test('fires Purchase once placed, under the ID the server tells Meta', async ({ page }) => {
    await stubPixelScript(page);
    const shop = await openShop(page, withPixel);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    await expect.poll(() => eventNamed(page, 'Purchase')).toBeTruthy();
    expect(await eventNamed(page, 'Purchase')).toMatchObject({
      data: {
        content_ids: [idOf('panjabi-M White')],
        content_type: 'product',
        currency: 'BDT',
        value: 1320,
        contents: [{ id: idOf('panjabi-M White'), quantity: 1 }],
      },
      options: { eventID: 'purchase.K7F2M9QX' },
    });
  });

  test('holds events raised before the Pixel is up, and tells them after', async ({ page }) => {
    await stubPixelScript(page);
    await page.addInitScript(() => {
      const real = window.requestIdleCallback.bind(window);
      window.requestIdleCallback = (callback) =>
        real(() => {
          setTimeout(callback, 1500);
        });
    });
    const shop = await openShop(page, withPixel);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await page.getByLabel('Name', { exact: true }).focus();
    await expect.poll(() => eventNamed(page, 'InitiateCheckout'), { timeout: 8000 }).toBeTruthy();
    const names = (await pixelCalls(page)).map((call) => call.name);
    expect(names).toEqual(['PageView', 'ViewContent', 'InitiateCheckout']);
  });

  test('with none connected, no Pixel code loads', async ({ page }) => {
    const script = await stubPixelScript(page);
    const shop = await openShop(page);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await page.getByLabel('Name', { exact: true }).focus();
    await page.waitForLoadState('networkidle');
    expect(script.requested()).toBe(0);
    expect(await page.evaluate(() => 'fbq' in window)).toBe(false);
  });

  test('its script blocked, the page and the order work all the same (LND-18)', async ({
    page,
  }) => {
    await page.route('https://connect.facebook.net/**', (route) => route.abort());
    const shop = await openShop(page, withPixel);
    await page.goto(shop.url('/l/cotton-panjabi'));
    await fillOrderForm(page);
    await expect(confirm(page)).toBeEnabled();
    await confirm(page).click();
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
    expect((await shop.sent()).orders).toHaveLength(1);
  });
});
