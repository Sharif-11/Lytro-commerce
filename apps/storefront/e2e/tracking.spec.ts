import { expect, test } from '@playwright/test';
import { OrderStatus, PaymentSessionState } from '@lytronix/validators/enums';
import type { TrackedOrder } from '../src/lib/api/storefront-api';
import { trackedOrder } from './support/fixtures';
import { alertOn, openShop } from './support/shop';

// ORD-17, SFT-08 (Slice 4.8e, the prototype's `tracking`): an order at a stable address for its tracking ID.

test('asks for an ID, and finds an order however it is typed', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
  }));
  await page.goto(shop.url('/track'));
  await expect(page.getByText('Enter the tracking ID you got when you ordered.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tracking ID' }).fill(' k7f2m9qx ');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.waitForURL('**/track/K7F2M9QX');
  await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
});

test('just placed: waiting for the shop to call', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'placed') },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  const steps = page.locator('.tl .s');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toHaveClass(/now/);
  await expect(steps.nth(0)).toContainText('Waiting for the shop to call');
  await expect(steps.nth(1)).toHaveClass(/todo/);
  await expect(page.locator('.sechead .st')).toHaveText('Placed');
  await expect(page.locator('.line', { hasText: 'Courier' })).toHaveCount(0);
});

test('shipped: each step its time on Dhaka’s clock, and the courier line', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'shipped') },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  const steps = page.locator('.tl .s');
  await expect(steps.nth(0)).toContainText('31 Oct, 11:42');
  await expect(steps.nth(1)).toContainText('31 Oct, 12:10');
  await expect(steps.nth(2)).toContainText('31 Oct, 18:12');
  await expect(steps.nth(3)).toHaveClass(/todo/);
  await expect(page.locator('.sechead .st')).toHaveText('Shipped');
  await expect(page.locator('.line', { hasText: 'Courier' })).toContainText(
    'Courier: Steadfast · SF-2610-4471',
  );
  await expect(page.getByRole('link', { name: "Courier's page" })).toHaveAttribute(
    'href',
    'https://steadfast.example/track/SF-2610-4471',
  );
});

test('a courier with no code or link leaves no empty half', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: {
      K7F2M9QX: {
        ...trackedOrder(language, 'shipped'),
        courier: { name: 'Pathao', trackingCode: null, trackingLink: null },
      },
    },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  await expect(page.locator('.line', { hasText: 'Courier' })).toHaveText('Courier: Pathao');
});

test('names its items as ordered: options, a combo’s parts, add-ons, answers, the tax', async ({
  page,
}) => {
  const shop = await openShop(page, (language) => ({
    tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
  }));
  await page.goto(shop.url('/track/K7F2M9QX'));
  const lines = page.locator('.side .cl');
  await expect(lines.nth(0)).toContainText('M · White × 1');
  await expect(lines.nth(0)).toContainText('+ Gift wrap ৳50');
  await expect(lines.nth(0)).toContainText('Name to embroider: Rafi');
  await expect(lines.nth(1)).toContainText('Chosen: Panjabi L, Check lungi');
  await expect(page.locator('.sum .r.total .price')).toHaveText('৳2,870');
  await expect(page.locator('.sum').getByText('Includes VAT 5%')).toBeVisible();
  // Never the customer's address or phone: the read holds neither.
  await expect(page.locator('.side')).not.toContainText('01711');
});

test('an add-on reads its own price, however many were ordered and however dear', async ({
  page,
}) => {
  const shop = await openShop(page, (language) => {
    const order = trackedOrder(language, 'confirmed');
    const [first, ...rest] = order.items;
    if (!first) throw new Error('the order has items');
    return {
      tracked: {
        K7F2M9QX: {
          ...order,
          items: [
            {
              ...first,
              quantity: '2.000',
              modifiers: [
                { groupName: 'Stitching', optionName: 'Hand stitching', priceChange: '1200.00' },
              ],
            },
            ...rest,
          ],
        },
      },
    };
  });
  await page.goto(shop.url('/track/K7F2M9QX'));
  await expect(page.locator('.side .cl').first()).toContainText('+ Hand stitching ৳1,200');
});

test('delivered, returned and cancelled each read as drawn', async ({ page }) => {
  const shop = await openShop(page, (language) => ({
    tracked: {
      DDDDDDDD: trackedOrder(language, 'delivered'),
      RRRRRRRR: trackedOrder(language, 'returned'),
      CCCCCCCC: trackedOrder(language, 'cancelled'),
    },
  }));
  await page.goto(shop.url('/track/DDDDDDDD'));
  await expect(page.locator('.sechead .st')).toHaveText('Delivered');
  await expect(page.locator('.tl .s.todo')).toHaveCount(0);

  await page.goto(shop.url('/track/RRRRRRRR'));
  await expect(page.locator('.sechead .st')).toHaveText('Returned');

  await page.goto(shop.url('/track/CCCCCCCC'));
  await expect(page.locator('.sechead .st')).toHaveText('Cancelled');
  await expect(
    page.getByText('The shop cancelled this order. Call the shop to ask why.'),
  ).toBeVisible();
  await expect(page.locator('.tl .s')).toHaveCount(2);
  await expect(page.locator('.line', { hasText: 'Courier' })).toHaveCount(0);
});

test('an ID that finds nothing says so, the search still there', async ({ page }) => {
  const shop = await openShop(page);
  await page.goto(shop.url('/track/NOSUCHID'));
  await expect(alertOn(page)).toHaveText('No order has that ID. Check it and try again.');
  await expect(page.getByRole('textbox', { name: 'Tracking ID' })).toHaveValue('NOSUCHID');
});

test('works with the storefront off, in the landing page’s frame (LND-02, LND-11)', async ({
  page,
}) => {
  const shop = await openShop(page, (language) => ({
    storefrontEnabled: false,
    tracked: { K7F2M9QX: trackedOrder(language, 'confirmed') },
  }));
  const answer = await page.goto(shop.url('/track/K7F2M9QX'));
  expect(answer?.status()).toBe(200);
  await expect(page.locator('.hdr.minimal')).toBeVisible();
  await expect(page.locator('.hdr nav')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '#261031-0047' })).toBeVisible();
});

test('in the storefront, its frame leads home', async ({ page }) => {
  const shop = await openShop(page);
  await page.goto(shop.url('/track'));
  await expect(page.locator('.hdr .back')).toHaveAttribute('href', '/');
});

test.describe('an order that owed an advance (PAY-08, PAY-11, PAY-17)', () => {
  const owing = (
    language: Parameters<typeof trackedOrder>[0],
    status: OrderStatus,
    state: PaymentSessionState | null,
    due = '2670.00',
  ): TrackedOrder => ({
    ...trackedOrder(language, 'placed'),
    status,
    codAmount: '2670.00',
    due,
    payment:
      state === null
        ? null
        : {
            paymentUrl: 'http://localhost:4181/__pay/K7F2M9QX',
            amount: '200.00',
            expiresAt: new Date(Date.now() + 18 * 60_000).toISOString(),
            state,
          },
  });

  test('the return goes on to the order, whatever the redirect claims of it', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: {
        K7F2M9QX: owing(language, OrderStatus.Unverified, PaymentSessionState.AwaitingPayment),
      },
    }));
    await page.goto(shop.url('/order/return?tracking_id=K7F2M9QX&status=verified&session_id=x'));
    await page.waitForURL(/\/order\/K7F2M9QX$/);
    // A forged "verified" changes nothing: the order says it isn't paid.
    await expect(page.getByRole('heading', { name: 'Payment not completed' })).toBeVisible();
    await expect(page.locator('.placed')).toContainText('held for 18 more minutes');
    await expect(page.getByRole('link', { name: 'Try the payment again' })).toHaveAttribute(
      'href',
      'http://localhost:4181/__pay/K7F2M9QX',
    );
    await expect(page.getByRole('link', { name: 'Call the shop' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/8801711223344',
    );
    await expect(page.getByText('cash on delivery', { exact: false })).toHaveCount(0);
  });

  test('a return with no order named is not found', async ({ page }) => {
    const shop = await openShop(page);
    const answer = await page.goto(shop.url('/order/return'));
    expect(answer?.status()).toBe(404);
  });

  test('paid: what was paid, what is left, and that the shop still calls (D5-9)', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      tracked: { K7F2M9QX: owing(language, OrderStatus.Pending, null) },
    }));
    await page.goto(shop.url('/order/K7F2M9QX'));
    await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
    await expect(page.locator('.placed')).toContainText('The shop will call to confirm');
    await expect(page.locator('.placed')).toContainText('Advance paid');
    await expect(page.locator('.placed .sum')).toContainText('৳200');
    await expect(page.locator('.placed .sum')).toContainText('৳2,670');
    await expect(page.getByText('order confirmed', { exact: false })).toHaveCount(0);
  });

  test('being checked: it can be closed, and it looks again by itself', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: { K7F2M9QX: owing(language, OrderStatus.Unverified, PaymentSessionState.Checking) },
    }));
    await page.goto(shop.url('/order/K7F2M9QX'));
    await expect(page.getByRole('heading', { name: 'Checking your payment' })).toBeVisible();
    await expect(page.locator('.placed')).toContainText('You can close this page');
    await expect(page.getByRole('link', { name: 'Wrong TrxID? Change it' })).toBeVisible();
    await expect(page.getByText('SMS')).toHaveCount(0);
    const looked = page.waitForRequest((request) => request.url().includes('/order/K7F2M9QX'), {
      timeout: 15_000,
    });
    await looked;
  });

  test('time ran out, or staff rejected it: what to do, and no way to pay', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: { K7F2M9QX: owing(language, OrderStatus.Cancelled, null) },
    }));
    await page.goto(shop.url('/order/K7F2M9QX'));
    await expect(
      page.getByRole('heading', { name: 'Time ran out, so the order was cancelled' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Order again' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Try the payment again' })).toHaveCount(0);
    await page.goto(shop.url('/order/return?tracking_id=K7F2M9QX&status=failed'));
    await expect(
      page.getByRole('heading', { name: 'Payment not confirmed, so the order was cancelled' }),
    ).toBeVisible();
  });

  test('an order that owed nothing keeps the ordinary confirmation', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: { K7F2M9QX: trackedOrder(language, 'placed') },
    }));
    await page.goto(shop.url('/order/K7F2M9QX'));
    await expect(page.locator('.placed')).not.toContainText('Advance paid');
    await expect(page.getByRole('link', { name: 'Track the order' })).toBeVisible();
  });

  test('tracking offers the open payment, then says it is being checked', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: {
        K7F2M9QX: owing(language, OrderStatus.Unverified, PaymentSessionState.AwaitingPayment),
        CHECKING: {
          ...owing(language, OrderStatus.Unverified, PaymentSessionState.Checking),
          trackingId: 'CHECKING',
        },
      },
    }));
    await page.goto(shop.url('/track/K7F2M9QX'));
    await expect(page.locator('.banner.warn')).toContainText('৳200 advance still to pay');
    await expect(page.locator('.banner.warn')).toContainText('within 18 minutes');
    await expect(page.getByRole('link', { name: 'Pay now' })).toHaveAttribute(
      'href',
      'http://localhost:4181/__pay/K7F2M9QX',
    );
    await page.goto(shop.url('/track/CHECKING'));
    await expect(page.locator('.banner.info')).toContainText('Checking your payment');
    await expect(page.getByRole('link', { name: 'Pay now' })).toHaveCount(0);
  });
});

test.describe("the courier's own words (STOREFRONT-DESIGN §7e, Slice 6.7)", () => {
  const said = (
    language: Parameters<typeof trackedOrder>[0],
    message: TrackedOrder['courierMessage'],
    patch: Partial<TrackedOrder> = {},
  ): TrackedOrder => ({ ...trackedOrder(language, 'shipped'), courierMessage: message, ...patch });

  test('once shipped, the courier line is its latest words, when, and the way to its page', async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      tracked: {
        K7F2M9QX: said(language, {
          en: 'Your parcel is out with the rider and arrives today.',
          bn: null,
          at: '2026-11-06T04:30:00.000Z',
        }),
      },
    }));
    await page.goto(shop.url('/track/K7F2M9QX'));
    const line = page.locator('.line', { hasText: 'Steadfast says' });
    await expect(line).toContainText('Steadfast says · 6 Nov, 10:30');
    await expect(line).toContainText('Your parcel is out with the rider and arrives today.');
    await expect(line.getByRole('link', { name: 'Track on Steadfast' })).toHaveAttribute(
      'href',
      'https://steadfast.example/track/SF-2610-4471',
    );
    await expect(line).toContainText('SF-2610-4471');
    await expect(page.locator('.line', { hasText: 'Courier:' })).toHaveCount(0);
  });

  test("shows the shopper's language where the courier sent both, else the one it sent", async ({
    page,
  }) => {
    const shop = await openShop(page, (language) => ({
      tracked: {
        K7F2M9QX: said(
          language,
          {
            en: 'Your parcel has reached the Mirpur hub.',
            bn: 'পার্সেলটি মিরপুর হাবে পৌঁছেছে।',
            at: '2026-11-05T13:02:00.000Z',
          },
          {
            courier: { name: 'RedX', trackingCode: '21A001REDX', trackingLink: null },
          },
        ),
      },
    }));
    await page.goto(shop.url('/track/K7F2M9QX'));
    await expect(page.getByText('Your parcel has reached the Mirpur hub.')).toBeVisible();
    await expect(page.getByText('পার্সেলটি মিরপুর হাবে পৌঁছেছে।')).toHaveCount(0);
    // No link: the code alone, with no dangling dot.
    const line = page.locator('.line', { hasText: 'RedX says' });
    await expect(line.getByRole('link')).toHaveCount(0);
    await expect(line).toContainText('21A001REDX');
    await expect(line).not.toContainText('· 21A001REDX');
  });

  test('in Bangla it reads the Bangla words, and an English-only message still shows', async ({
    page,
  }) => {
    const shop = await openShop(
      page,
      (language) => ({
        tracked: {
          BOTHWAYS: said(language, {
            en: 'Your parcel has reached the Mirpur hub.',
            bn: 'পার্সেলটি মিরপুর হাবে পৌঁছেছে।',
            at: '2026-11-05T13:02:00.000Z',
          }),
          ENGLISH1: said(language, {
            en: 'Delivery in progress.',
            bn: null,
            at: '2026-11-05T13:02:00.000Z',
          }),
        },
      }),
      'bn',
    );
    await page.goto(shop.url('/track/BOTHWAYS'));
    await expect(page.locator('.line', { hasText: 'Steadfast লিখেছে' })).toContainText(
      'পার্সেলটি মিরপুর হাবে পৌঁছেছে।',
    );
    await expect(page.getByRole('link', { name: 'Steadfast-এর পেজে ট্র্যাক করুন' })).toBeVisible();
    await page.goto(shop.url('/track/ENGLISH1'));
    await expect(page.locator('.line', { hasText: 'Steadfast লিখেছে' })).toContainText(
      'Delivery in progress.',
    );
  });

  test('a part delivery says so plainly above the order', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: {
        K7F2M9QX: said(
          language,
          { en: 'Partly delivered.', bn: null, at: '2026-11-06T11:10:00.000Z' },
          { status: OrderStatus.PartialDelivered },
        ),
      },
    }));
    await page.goto(shop.url('/track/K7F2M9QX'));
    await expect(
      page.locator('.banner.warn', {
        hasText: 'Part of the order was delivered; the rest is going back to the shop.',
      }),
    ).toBeVisible();
  });

  test('a parcel going back says so plainly above the order, and only then', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: {
        BACKBACK: said(
          language,
          { en: 'The parcel is on its way back.', bn: null, at: '2026-11-06T12:00:00.000Z' },
          { courierReturning: true },
        ),
        ONITSWAY: said(language, {
          en: 'Your parcel is out with the rider and arrives today.',
          bn: null,
          at: '2026-11-06T04:30:00.000Z',
        }),
      },
    }));
    await page.goto(shop.url('/track/BACKBACK'));
    await expect(
      page.locator('.banner.warn', {
        hasText: 'The parcel is going back to the shop. Call the shop with any questions.',
      }),
    ).toBeVisible();
    await expect(page.locator('.sechead .st')).toHaveText('Shipped');
    await page.goto(shop.url('/track/ONITSWAY'));
    await expect(page.locator('.banner.warn')).toHaveCount(0);
  });

  test('a shipped order with no words yet keeps the plain courier line', async ({ page }) => {
    const shop = await openShop(page, (language) => ({
      tracked: { K7F2M9QX: said(language, null) },
    }));
    await page.goto(shop.url('/track/K7F2M9QX'));
    await expect(page.locator('.line', { hasText: 'Courier' })).toContainText(
      'Courier: Steadfast · SF-2610-4471',
    );
    await expect(page.getByText('Steadfast says')).toHaveCount(0);
    await expect(page.locator('.banner.warn')).toHaveCount(0);
  });
});
