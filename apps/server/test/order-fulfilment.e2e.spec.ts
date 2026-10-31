import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderLimitMode, PlatformSettingKey, UsageMetric } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { USAGE_NOTICES } from '../src/modules/usage-warnings/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { postJson, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { UsageNoticeCapture } from './support/usage-notice-capture';

// Phase 4 Slice 4.3a, agreed 2026-10-30: moving a whole order by hand (D4-7) -- shipped with its courier (ORD-09) or
// handed over at the counter, then delivered with its cash collected, and returned item by item (ORD-10, INV-17) --
// and the handling it is counted and charged by when it first leaves: the trial's total, the day's and the period's
// limits with their mode (QTA-01 to QTA-06, TRL-03) and the pay-as-you-go fee (PYG-02 to PYG-05). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_order_fulfilment_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const notices = new UsageNoticeCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'order-fulfilment-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(USAGE_NOTICES)
    .useValue(notices)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  confirmedAt: string | null;
  courierName: string | null;
  trackingCode: string | null;
  trackingLink: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  handledAt: string | null;
  grandTotal: string;
  due: string;
  items: { id: string; quantity: string }[];
  history: { field: string; from: string | null; to: string | null; note: string | null }[];
  payments: { method: string; amount: string; transactionId: string | null }[];
  limitPrompt: { metric: string; limit: number } | null;
}

interface Locations {
  zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}
let locations: Locations | null = null;

async function thanaId(shop: ShopClient, zilla: string, thana: string): Promise<number> {
  if (!locations) locations = (await shop.get('/locations')).body as Locations;
  const found = locations.zillas
    .find((row) => row.nameEn === zilla)
    ?.thanas.find((row) => row.nameEn === thana);
  if (!found) throw new Error(`no thana ${zilla}/${thana}`);
  return found.id;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  stock: number,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], ...(stock > 0 ? { openingStock: stock } : {}) }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

async function place(
  shop: ShopClient,
  variantId: string,
  quantity: number,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: freshMobile(),
      locationId: await thanaId(shop, 'Dhaka', 'Mirpur'),
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity }],
      ...extra,
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

function takeaway(shop: ShopClient, variantId: string, quantity: number): Promise<Order> {
  return place(shop, variantId, quantity, {
    fulfilmentType: 'takeaway',
    locationId: undefined,
    deliveryAddress: undefined,
  });
}

function ship(
  shop: ShopClient,
  order: Order,
  body: Record<string, unknown> = {},
): Promise<HttpResult> {
  return shop.post(`/orders/${order.id}/ship`, {
    courierName: 'Steadfast',
    trackingCode: 'SF-1001',
    ...body,
  });
}

async function shipped(
  shop: ShopClient,
  order: Order,
  body: Record<string, unknown> = {},
): Promise<Order> {
  const result = await ship(shop, order, body);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Order;
}

async function onHand(
  shop: ShopClient,
  productId: string,
): Promise<{ onHand: string | null; reserved: string | null }> {
  const stock = (await shop.get(`/products/${productId}/stock`)).body as {
    variants: { onHand: string | null; reserved: string | null }[];
  };
  const [variant] = stock.variants;
  return { onHand: variant?.onHand ?? null, reserved: variant?.reserved ?? null };
}

async function overrideLimit(tenantId: string, key: string, value: number | null): Promise<void> {
  await app
    .get(PlanLimitOverridesService)
    .set(tenantId, key, value, 'handling limit test', randomUUID());
}

describeIfDatabase(
  'shipping, handing over and delivering by hand (ORD-09, D4-7, agreed 2026-10-30)',
  () => {
    it('ships with a courier and a tracking code or link, takes the stock out, and confirms an order no call had', async () => {
      const shop = await openShop(port, texts, 'ful');
      const lamp = await product(shop, 'Lamp', 300, 5);
      const order = await place(shop, lamp.variantId, 2);
      expect(order.confirmedAt).toBeNull();
      expect(await onHand(shop, lamp.id)).toEqual({ onHand: '5.000', reserved: '2.000' });
      const untracked = await shop.post(`/orders/${order.id}/ship`, { courierName: 'Steadfast' });
      expect(untracked.status).toBe(400);
      expect(fieldsOf(untracked)).toEqual({ trackingCode: 'required' });
      const sent = await shipped(shop, order, {
        trackingCode: undefined,
        trackingLink: 'https://steadfast.com.bd/t/SF-1001',
      });
      expect(sent).toMatchObject({
        status: 'shipped',
        fulfillmentStatus: 'shipped',
        courierName: 'Steadfast',
        trackingCode: null,
        trackingLink: 'https://steadfast.com.bd/t/SF-1001',
        limitPrompt: null,
      });
      expect(sent.shippedAt).not.toBeNull();
      expect(sent.handledAt).toBe(sent.shippedAt);
      expect(sent.confirmedAt).not.toBeNull();
      expect(sent.history.map((row) => [row.field, row.to])).toEqual(
        expect.arrayContaining([
          ['confirmed', 'confirmed'],
          ['fulfillment_status', 'shipped'],
        ]),
      );
      expect(await onHand(shop, lamp.id)).toEqual({ onHand: '3.000', reserved: '0.000' });
    });

    it('refuses what may not be sent: twice, held, cancelled, or the other step for its kind', async () => {
      const shop = await openShop(port, texts, 'ful');
      const lamp = await product(shop, 'Lamp', 300, 20);
      const once = await place(shop, lamp.variantId, 1);
      await shipped(shop, once);
      expect(errorOf(await ship(shop, once)).message).toBeTruthy();
      expect((await ship(shop, once)).status).toBe(409);
      const held = await place(shop, lamp.variantId, 1);
      expect((await shop.post(`/orders/${held.id}/override`, { override: 'hold' })).status).toBe(
        200,
      );
      expect((await ship(shop, held)).status).toBe(409);
      const cancelled = await place(shop, lamp.variantId, 1);
      expect(
        (await shop.post(`/orders/${cancelled.id}/cancel`, { reason: 'customer_cancelled' }))
          .status,
      ).toBe(200);
      expect((await ship(shop, cancelled)).status).toBe(409);
      const counter = await takeaway(shop, lamp.variantId, 1);
      expect((await ship(shop, counter)).status).toBe(409);
      const delivery = await place(shop, lamp.variantId, 1);
      expect((await shop.post(`/orders/${delivery.id}/hand-over`, {})).status).toBe(409);
      expect((await shop.post(`/orders/${delivery.id}/deliver`, {})).status).toBe(409);
      const handled = await admin.query<{ handled: string }>(
        'SELECT count(*)::text AS handled FROM tenant.orders WHERE tenant_id = $1 AND handled_at IS NOT NULL',
        [shop.tenantId],
      );
      expect(handled.rows[0]?.handled).toBe('1');
    });

    it('delivers a shipped order, its cash on delivery collected, so it is paid with nothing due', async () => {
      const shop = await openShop(port, texts, 'ful');
      const lamp = await product(shop, 'Lamp', 300, 5);
      const order = await shipped(shop, await place(shop, lamp.variantId, 2));
      const delivered = await shop.post(`/orders/${order.id}/deliver`, {});
      expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
      expect(delivered.body).toMatchObject({
        status: 'delivered',
        fulfillmentStatus: 'delivered',
        paymentStatus: 'paid',
        grandTotal: '670.00',
        due: '0.00',
        handledAt: order.handledAt,
        payments: [{ method: 'cash_on_delivery', amount: '670.00', transactionId: null }],
      });
      expect((await shop.post(`/orders/${order.id}/deliver`, {})).status).toBe(409);
    });

    it('hands a takeaway order over in one step: stock out, delivered and paid', async () => {
      const shop = await openShop(port, texts, 'ful');
      const tea = await product(shop, 'Tea', 50, 10);
      const order = await takeaway(shop, tea.variantId, 3);
      const handed = await shop.post(`/orders/${order.id}/hand-over`, {});
      expect(handed.status, JSON.stringify(handed.body)).toBe(200);
      expect(handed.body).toMatchObject({
        status: 'delivered',
        fulfillmentStatus: 'delivered',
        paymentStatus: 'paid',
        due: '0.00',
        payments: [{ method: 'cash_on_delivery', amount: '150.00' }],
      });
      expect(await onHand(shop, tea.id)).toEqual({ onHand: '7.000', reserved: '0.000' });
    });

    it("answers 404 for another shop's order on every step, and leaves its stock held (SEC-02)", async () => {
      const shop = await openShop(port, texts, 'ful');
      const other = await openShop(port, texts, 'ful');
      const lamp = await product(shop, 'Lamp', 300, 5);
      const order = await place(shop, lamp.variantId, 1);
      const [line] = order.items;
      expect((await ship(other, order)).status).toBe(404);
      expect((await other.post(`/orders/${order.id}/hand-over`, {})).status).toBe(404);
      expect((await other.post(`/orders/${order.id}/deliver`, {})).status).toBe(404);
      const returned = await other.post(`/orders/${order.id}/returns`, {
        items: [{ lineId: line?.id, sellable: 1, damaged: 0 }],
      });
      expect(returned.status).toBe(404);
      expect(await onHand(shop, lamp.id)).toEqual({ onHand: '5.000', reserved: '1.000' });
    });

    it('ships a serial-numbered item only with a serial for each unit, sold to the order', async () => {
      const shop = await openShop(port, texts, 'ful');
      const phone = await product(shop, 'Phone', 15000, 0, {
        serialTracked: true,
        serialFormat: 'any',
      });
      const added = await shop.post(
        `/products/${phone.id}/variants/${phone.variantId}/stock-additions`,
        {
          quantity: 2,
          serials: ['SN-A', 'SN-B'],
        },
      );
      expect(added.status, JSON.stringify(added.body)).toBe(200);
      const order = await place(shop, phone.variantId, 1);
      expect((await ship(shop, order)).status).toBe(409);
      const [line] = order.items;
      // Slice 4.8a: the ship sheet's choice, the serials the phone holds.
      type Serials = {
        items: { lineId: string; variantId: string; inStock: string[]; sent: string[] }[];
      };
      const serials = async (of = shop) =>
        (await of.get(`/orders/${order.id}/serials`)) as { status: number; body: Serials };
      const waiting = (await serials()).body.items;
      expect(waiting).toHaveLength(1);
      expect(waiting[0]).toMatchObject({
        lineId: line?.id,
        variantId: phone.variantId,
        productName: 'Phone',
        quantity: '1.000',
        serialFormat: 'any',
        sent: [],
      });
      expect([...(waiting[0]?.inStock ?? [])].sort()).toEqual(['SN-A', 'SN-B']);
      expect((await serials(await openShop(port, texts, 'ful'))).status).toBe(404);
      await shipped(shop, order, { serials: [{ lineId: line?.id, serials: ['SN-B'] }] });
      const sold = await admin.query<{ serial: string; sold_order_id: string }>(
        `SELECT serial, sold_order_id FROM tenant.serial_numbers WHERE tenant_id = $1 AND status = 'sold'`,
        [shop.tenantId],
      );
      expect(sold.rows).toEqual([{ serial: 'SN-B', sold_order_id: order.id }]);
      // Gone: the return sheet's choice, the serial it was sent with -- until it comes back.
      expect((await serials()).body.items[0]).toMatchObject({ inStock: [], sent: ['SN-B'] });
      const back = await shop.post(`/orders/${order.id}/returns`, {
        items: [
          {
            lineId: line?.id,
            sellable: 1,
            damaged: 0,
            serials: { sellable: ['SN-B'], damaged: [] },
          },
        ],
      });
      expect(back.status, JSON.stringify(back.body)).toBe(200);
      expect((await serials()).body.items[0]).toMatchObject({ inStock: [], sent: [] });
    });
  },
);

describeIfDatabase('returns, item by item (ORD-10, INV-17)', () => {
  it('takes back only sellable units into stock, and returns the order once every unit is back', async () => {
    const shop = await openShop(port, texts, 'ful');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await shipped(shop, await place(shop, lamp.variantId, 2));
    await shop.post(`/orders/${order.id}/deliver`, {});
    const [line] = order.items;
    const first = await shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: line?.id, sellable: 1, damaged: 0 }],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ fulfillmentStatus: 'delivered', status: 'delivered' });
    // Slice 4.8a: the item says how many came back; a lamp is no serial-numbered unit.
    expect(
      (first.body as { items: { returnedQuantity: string }[] }).items[0]?.returnedQuantity,
    ).toBe('1.000');
    expect((await shop.get(`/orders/${order.id}/serials`)).body).toEqual({ items: [] });
    expect(await onHand(shop, lamp.id)).toEqual({ onHand: '4.000', reserved: '0.000' });
    const tooMany = await shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: line?.id, sellable: 1, damaged: 1 }],
    });
    expect(tooMany.status).toBe(409);
    const rest = await shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: line?.id, sellable: 0, damaged: 1 }],
      note: 'Box crushed',
    });
    expect(rest.status, JSON.stringify(rest.body)).toBe(200);
    const returned = rest.body as Order;
    expect(returned).toMatchObject({ fulfillmentStatus: 'returned', status: 'returned' });
    expect(returned.history.filter((row) => row.field === 'return').map((row) => row.note)).toEqual(
      ['Lamp: 1.000 sellable, 0.000 damaged', 'Lamp: 0.000 sellable, 1.000 damaged; Box crushed'],
    );
    expect(await onHand(shop, lamp.id)).toEqual({ onHand: '4.000', reserved: '0.000' });
  });

  it('refuses a return for an order that has not shipped', async () => {
    const shop = await openShop(port, texts, 'ful');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId, 1);
    const [line] = order.items;
    const early = await shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: line?.id, sellable: 1, damaged: 0 }],
    });
    expect(early.status).toBe(409);
  });
});

describeIfDatabase('the handling limits (QTA-01 to QTA-06, TRL-03)', () => {
  it('holds a trial to its total, counted once per order, and shows it on the usage page', async () => {
    const shop = await openShop(port, texts, 'ful');
    await overrideLimit(shop.tenantId, 'orders_total', 2);
    const lamp = await product(shop, 'Lamp', 300, 20);
    const first = await shipped(shop, await place(shop, lamp.variantId, 1));
    await shop.post(`/orders/${first.id}/deliver`, {});
    await shipped(shop, await place(shop, lamp.variantId, 1));
    const third = await place(shop, lamp.variantId, 1);
    const refused = await ship(shop, third);
    expect(refused.status).toBe(402);
    expect(errorOf(refused)).toMatchObject({
      code: 'plan_limit_reached',
      details: { metric: UsageMetric.OrdersTotal, limit: 2 },
    });
    // QTA-07: making orders is never limited by handling.
    await place(shop, lamp.variantId, 1);
    const usage = (await shop.get('/usage')).body as {
      metrics: { metric: UsageMetric; used: number; limit: number | null }[];
    };
    expect(usage.metrics.find((figure) => figure.metric === UsageMetric.OrdersTotal)).toMatchObject(
      {
        used: 2,
        limit: 2,
      },
    );
  });

  it("lets the period's limit through with a prompt, or refuses it in block mode", async () => {
    const shop = await openShop(port, texts, 'ful');
    await overrideLimit(shop.tenantId, 'orders_total', null);
    await overrideLimit(shop.tenantId, 'orders_handled_monthly', 1);
    const lamp = await product(shop, 'Lamp', 300, 20);
    expect((await shipped(shop, await place(shop, lamp.variantId, 1))).limitPrompt).toBeNull();
    const past = await shipped(shop, await place(shop, lamp.variantId, 1));
    expect(past.limitPrompt).toEqual({ metric: UsageMetric.OrdersMonthly, limit: 1 });
    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.OrderLimitMode, OrderLimitMode.Block, randomUUID());
    try {
      const blocked = await ship(shop, await place(shop, lamp.variantId, 1));
      expect(blocked.status).toBe(402);
      expect(errorOf(blocked).details).toMatchObject({ metric: UsageMetric.OrdersMonthly });
    } finally {
      await settings.set(
        PlatformSettingKey.OrderLimitMode,
        OrderLimitMode.AllowWithPrompt,
        randomUUID(),
      );
    }
  });

  it("always refuses past the day's limit, whatever the mode", async () => {
    const shop = await openShop(port, texts, 'ful');
    await overrideLimit(shop.tenantId, 'orders_total', null);
    await overrideLimit(shop.tenantId, 'orders_handled_daily', 1);
    const lamp = await product(shop, 'Lamp', 300, 20);
    await shipped(shop, await place(shop, lamp.variantId, 1));
    const second = await ship(shop, await place(shop, lamp.variantId, 1));
    expect(second.status).toBe(402);
    expect(errorOf(second).details).toMatchObject({ metric: UsageMetric.OrdersDaily, limit: 1 });
  });

  it('warns at 80% of the limit, with the handling that reaches it (LIM-01, QTA-02)', async () => {
    const shop = await openShop(port, texts, 'ful');
    await overrideLimit(shop.tenantId, 'orders_total', 5);
    const lamp = await product(shop, 'Lamp', 300, 20);
    for (let index = 0; index < 4; index += 1) {
      await shipped(shop, await place(shop, lamp.variantId, 1));
    }
    expect(notices.levelsFor(shop.tenantId, UsageMetric.OrdersTotal)).toContain(80);
  });
});

describeIfDatabase('the pay-as-you-go order fee (PYG-02 to PYG-05, PYG-14)', () => {
  async function payAsYouGo(balance: string): Promise<ShopClient> {
    const shop = await openShop(port, texts, 'ful');
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go',
         plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
         plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
       WHERE id = $1`,
      [shop.tenantId],
    );
    await seedBalance(admin, shop.tenantId, balance);
    return shop;
  }

  async function orderFees(tenantId: string): Promise<{ amount: string; reference: unknown }[]> {
    const result = await admin.query<{ amount: string; reference: unknown }>(
      "SELECT amount, reference FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'order_fee' ORDER BY id",
      [tenantId],
    );
    return result.rows;
  }

  it('charges the fee once, when the order first leaves, never at creation or delivery', async () => {
    const shop = await payAsYouGo('100.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId, 1);
    expect(await orderFees(shop.tenantId)).toEqual([]);
    await shipped(shop, order);
    await shop.post(`/orders/${order.id}/deliver`, {});
    const fees = await orderFees(shop.tenantId);
    expect(fees).toHaveLength(1);
    // PYG-14: the entry names its order, the total it was worked out on, and the rates applied.
    expect(fees[0]).toMatchObject({
      amount: '-20.00',
      reference: { orderId: order.id, orderTotal: '370.00' },
    });
    const rates = fees[0]?.reference as { minimum: string; percent: string };
    expect([Number(rates.minimum), Number(rates.percent)]).toEqual([20, 1.5]);
  });

  it('refuses to send an order the balance cannot pay the fee for, leaving it as it was', async () => {
    // The product's own 10 TK creation fee leaves 5 TK, short of the order's 20 TK.
    const shop = await payAsYouGo('15.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId, 1);
    const refused = await ship(shop, order);
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('quota_exceeded');
    const kept = (await shop.get(`/orders/${order.id}`)).body as Order;
    expect(kept).toMatchObject({ fulfillmentStatus: 'unfulfilled', handledAt: null });
    expect(await onHand(shop, lamp.id)).toEqual({ onHand: '5.000', reserved: '1.000' });
    expect(await orderFees(shop.tenantId)).toEqual([]);
  });
});

describeIfDatabase('what the screens read (Slice 4.8): areas, calls, couriers, Home', () => {
  const ok = (status: number) => {
    expect([200, 201]).toContain(status);
  };

  it("lists each order's area and unanswered calls, and the order its customer's order count", async () => {
    const shop = await openShop(port, texts, 'ful');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const phone = freshMobile();
    const first = await place(shop, lamp.variantId, 1, { phone });
    const second = await place(shop, lamp.variantId, 1, { phone });
    ok((await shop.post(`/orders/${first.id}/calls`, { outcome: 'confirmed' })).status);
    ok((await shop.post(`/orders/${second.id}/calls`, { outcome: 'no_answer' })).status);
    ok((await shop.post(`/orders/${second.id}/calls`, { outcome: 'no_answer' })).status);
    const counter = await takeaway(shop, lamp.variantId, 1);
    const list = (await shop.get('/orders')).body as {
      orders: { id: string; area: unknown; unansweredCalls: number }[];
    };
    const row = (id: string) => list.orders.find((each) => each.id === id);
    expect(row(second.id)).toMatchObject({
      area: { thana: { nameEn: 'Mirpur' }, zilla: { nameEn: 'Dhaka' } },
      unansweredCalls: 2,
    });
    expect(row(first.id)?.unansweredCalls).toBe(0);
    expect(row(counter.id)?.area).toBeNull();
    const detail = (await shop.get(`/orders/${first.id}`)).body as {
      customerOrders: number | null;
    };
    expect(detail.customerOrders).toBe(2);
  });

  it('lists the couriers the shop has shipped with, the most recent first, and none of another shop', async () => {
    const shop = await openShop(port, texts, 'ful');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const couriers = async (of: ShopClient) =>
      ((await of.get('/orders/couriers')).body as { couriers: string[] }).couriers;
    expect(await couriers(shop)).toEqual([]);
    // Pathao shipped more, but Steadfast was used last: recency, not the count, comes first.
    await shipped(shop, await place(shop, lamp.variantId, 1), {
      courierName: 'Pathao',
      trackingCode: 'P-1',
    });
    await shipped(shop, await place(shop, lamp.variantId, 1), {
      courierName: 'Pathao',
      trackingCode: 'P-2',
    });
    await shipped(shop, await place(shop, lamp.variantId, 1), {
      courierName: 'Steadfast',
      trackingCode: 'S-1',
    });
    expect(await couriers(shop)).toEqual(['Steadfast', 'Pathao']);
    expect(await couriers(await openShop(port, texts, 'ful'))).toEqual([]);
  });

  it("counts Home's orders -- to confirm, calls due, to ship, today, yesterday -- with the month's sales", async () => {
    const shop = await openShop(port, texts, 'ful');
    const lamp = await product(shop, 'Lamp', 300, 10);
    await place(shop, lamp.variantId, 1);
    const held = await place(shop, lamp.variantId, 1);
    ok(
      (
        await shop.post(`/orders/${held.id}/calls`, {
          outcome: 'call_back_later',
          callBackAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
      ).status,
    );
    // Its time comes: the call is due.
    await admin.query(
      `UPDATE tenant.orders SET hold_until = now() - interval '1 minute' WHERE id = $1`,
      [held.id],
    );
    const later = await place(shop, lamp.variantId, 1);
    ok(
      (
        await shop.post(`/orders/${later.id}/calls`, {
          outcome: 'call_back_later',
          callBackAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
      ).status,
    );
    const confirmed = await place(shop, lamp.variantId, 1);
    ok((await shop.post(`/orders/${confirmed.id}/calls`, { outcome: 'confirmed' })).status);
    // A confirmed takeaway is handed over, never shipped.
    const counter = await takeaway(shop, lamp.variantId, 1);
    ok((await shop.post(`/orders/${counter.id}/calls`, { outcome: 'confirmed' })).status);
    const sold = await takeaway(shop, lamp.variantId, 2);
    expect((await shop.post(`/orders/${sold.id}/hand-over`, {})).status).toBe(200);
    // One placed a day ago counts as yesterday's, not today's. The orders guard keeps created_at, so it steps aside.
    const before = await place(shop, lamp.variantId, 1);
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL session_replication_role = replica');
      await admin.query(
        `UPDATE tenant.orders SET created_at = created_at - interval '1 day' WHERE id = $1`,
        [before.id],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
    const home = (await shop.get('/home')).body as { orders: unknown; stock: { short: number } };
    expect(home.orders).toEqual({
      toConfirm: 2,
      callsDue: 1,
      toShip: 1,
      today: 6,
      yesterday: 1,
      monthSales: '600.00',
    });
    // Nothing is short here; test/reservations.e2e.spec.ts counts one that is.
    expect(home.stock.short).toBe(0);
  });
});
