import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UsageMetric } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DAY_MS, dhakaDate } from '../src/common/time';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { postJson } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { expectLedgerAgrees } from './support/stock-ledger';

// PHASE-4-PLAN §1, exit criterion 2: the order golden path, as one test, for one cosmetics shop on pay-as-you-go. Staff
// enter two shades and a combo pack, and its stock is held; a call with no answer, then a call that confirms; shipped
// with a tracking code, the combo's serial asked and the shades taken earliest expiry first, counted and charged once;
// delivered; one unit back damaged and one sellable. After each step `agrees` reads the order's two axes and visible
// status, the stock levels and ledger, the customer's totals, the sales figures, the plan's count and the balance, each
// through what the shop itself reads. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_order_golden_path_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'order-golden-path-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
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
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  courierName: string | null;
  trackingCode: string | null;
  handledAt: string | null;
  grandTotal: string;
  due: string;
  customerId: string | null;
  items: { id: string; productName: string; returnedQuantity: string }[];
  calls: { outcome: string }[];
  history: { field: string; from: string | null; to: string | null }[];
}

interface Stocked {
  productId: string;
  variantId: string;
}

interface Figures {
  order: { status: string; paymentStatus: string; fulfillmentStatus: string; due: string };
  /** On hand and reserved, shade by shade and part by part. */
  stock: { ruby: string[]; coral: string[]; liner: string[]; curler: string[] };
  customer: { orderCount: number; totalSpent: string };
  sales: {
    orders: number;
    revenue: string;
    deliveryCharges: string;
    costOfGoods: string;
    profit: string;
  };
  /** Orders counted toward the plan: this period and today. */
  handled: number;
  /** The order fees charged, as the ledger has them. */
  fees: string[];
}

const SLOW = 120_000;
const day = (offset: number): string => dhakaDate(new Date(Date.now() + offset * DAY_MS));

async function stockOn(
  shop: ShopClient,
  productId: string,
  variantId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const added = await shop.post(
    `/products/${productId}/variants/${variantId}/stock-additions`,
    body,
  );
  expect(added.status, JSON.stringify(added.body)).toBe(200);
}

async function single(
  shop: ShopClient,
  body: Record<string, unknown>,
): Promise<{ productId: string; variantId: string }> {
  const made = await shop.post('/products', { variants: [{ optionIds: [] }], ...body });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const { id, variants } = made.body as { id: string; variants: { id: string }[] };
  return { productId: id, variantId: variants[0]?.id ?? '' };
}

async function levelsOf(shop: ShopClient, { productId, variantId }: Stocked): Promise<string[]> {
  const read = await shop.get(`/products/${productId}/stock`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const found = (
    read.body as { variants: { variantId: string; onHand: string; reserved: string }[] }
  ).variants.find((row) => row.variantId === variantId);
  return [found?.onHand ?? '', found?.reserved ?? ''];
}

async function batchesOf(shop: ShopClient, productId: string): Promise<Record<string, string>> {
  const read = await shop.get(`/products/${productId}/batches`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return Object.fromEntries(
    (read.body as { batches: { batchCode: string; quantity: string }[] }).batches.map((row) => [
      row.batchCode,
      row.quantity,
    ]),
  );
}

async function movementsOf(shop: ShopClient, { productId, variantId }: Stocked) {
  const read = await shop.get(`/products/${productId}/variants/${variantId}/stock-history`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return (
    read.body as {
      movements: { delta: string; reason: string; batch: { batchCode: string | null } | null }[];
    }
  ).movements.map((row) => [row.reason, row.delta, row.batch?.batchCode ?? null]);
}

async function balanceOf(tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ total: string }>(
    'SELECT coalesce(sum(amount), 0)::text AS total FROM tenant.balance_ledger WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(rows[0]?.total);
}

describeIfDatabase('the order golden path (PHASE-4-PLAN §1, exit criterion 2)', () => {
  it(
    'staff enter two shades and a combo, call, ship, deliver and take two back, with every figure agreeing at each step',
    async () => {
      const shop = await openShop(port, texts, 'orderpath');
      expect((await shop.put('/business-type', { businessType: 'cosmetics' })).status).toBe(200);
      await admin.query(
        `UPDATE control.tenants SET state = 'pay_as_you_go',
           plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
           plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
         WHERE id = $1`,
        [shop.tenantId],
      );
      await seedBalance(admin, shop.tenantId, '1000.00');

      // The shades: Ruby in two batches, the one bought second expiring first, so its average cost is (8 x 225 + 2 x
      // 300) / 10 = 240. The combo pack holds no stock: an eyeliner in a batch, and a serial-numbered curler.
      const attributes = (await shop.get('/attributes')).body as {
        id: string;
        name: string;
        scope: string;
      }[];
      const shade = attributes.find((row) => row.name === 'Shade' && row.scope === 'platform');
      const options = await shop.post(`/attributes/${shade?.id ?? ''}/options/batch`, {
        values: ['Ruby', 'Coral'],
      });
      expect(options.status, JSON.stringify(options.body)).toBe(201);
      const [rubyOption, coralOption] = (options.body as { id: string }[]).map((row) => row.id);
      const madeLipstick = await shop.post('/products', {
        name: 'Matte lipstick',
        basePrice: 500,
        batchTracked: true,
        variantAttributes: [{ attributeId: shade?.id, optionIds: [rubyOption, coralOption] }],
        variants: [{ optionIds: [rubyOption] }, { optionIds: [coralOption] }],
      });
      expect(madeLipstick.status, JSON.stringify(madeLipstick.body)).toBe(201);
      const lipstick = madeLipstick.body as {
        id: string;
        variants: { id: string; optionIds: string[] }[];
      };
      const shadeOf = (option: string | undefined): Stocked => ({
        productId: lipstick.id,
        variantId: lipstick.variants.find((row) => row.optionIds[0] === option)?.id ?? '',
      });
      const ruby = shadeOf(rubyOption);
      const coral = shadeOf(coralOption);
      await stockOn(shop, lipstick.id, ruby.variantId, {
        quantity: 8,
        unitCost: 225,
        batch: { batchCode: 'RUBY-LATE', expiresOn: day(120) },
      });
      await stockOn(shop, lipstick.id, ruby.variantId, {
        quantity: 2,
        unitCost: 300,
        batch: { batchCode: 'RUBY-SOON', expiresOn: day(30) },
      });
      await stockOn(shop, lipstick.id, coral.variantId, {
        quantity: 4,
        unitCost: 150,
        batch: { batchCode: 'CORAL-1', expiresOn: day(60) },
      });
      const liner = await single(shop, { name: 'Eyeliner', basePrice: 300, batchTracked: true });
      await stockOn(shop, liner.productId, liner.variantId, {
        quantity: 5,
        unitCost: 100,
        batch: { batchCode: 'LINER-1', expiresOn: day(90) },
      });
      const curler = await single(shop, {
        name: 'Curler',
        basePrice: 1400,
        batchTracked: false,
        serialTracked: true,
        serialFormat: 'any',
      });
      await stockOn(shop, curler.productId, curler.variantId, {
        quantity: 2,
        unitCost: 900,
        serials: ['CRL-1', 'CRL-2'],
      });
      const pack = await single(shop, {
        name: 'Party set',
        basePrice: 1500,
        kind: 'combo',
        variants: undefined,
        parts: [
          { quantity: 1, variantIds: [liner.variantId] },
          { quantity: 1, variantIds: [curler.variantId] },
        ],
      });

      const phone = `017${String(randomInt(10_000_000, 99_999_999))}`;
      const { zillas } = (await shop.get('/locations')).body as {
        zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
      };
      const mirpur = zillas
        .find((row) => row.nameEn === 'Dhaka')
        ?.thanas.find((row) => row.nameEn === 'Mirpur');
      const today = dhakaDate(new Date());

      /** Everything §1 says must agree, read as the shop reads it. */
      const agrees = async (orderId: string, expected: Figures): Promise<Order> => {
        const opened = await shop.get(`/orders/${orderId}`);
        expect(opened.status, JSON.stringify(opened.body)).toBe(200);
        const order = opened.body as Order;
        const customer = await shop.get(`/customers/${order.customerId ?? ''}`);
        expect(customer.status, JSON.stringify(customer.body)).toBe(200);
        const sales = await shop.get(`/sales?dateFrom=${today}&dateTo=${today}`);
        expect(sales.status, JSON.stringify(sales.body)).toBe(200);
        const { totals } = sales.body as {
          totals: {
            orders: number;
            revenue: string;
            deliveryCharges: string;
            profit: { costOfGoods: string; profit: string };
          };
        };
        const usage = (await shop.get('/usage')).body as {
          metrics: { metric: UsageMetric; used: number }[];
        };
        const usedOf = (metric: UsageMetric): number | undefined =>
          usage.metrics.find((row) => row.metric === metric)?.used;
        const fees = await admin.query<{ amount: string }>(
          "SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'order_fee' ORDER BY id",
          [shop.tenantId],
        );
        expect({
          order: {
            status: order.status,
            paymentStatus: order.paymentStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            due: order.due,
          },
          stock: {
            ruby: await levelsOf(shop, ruby),
            coral: await levelsOf(shop, coral),
            liner: await levelsOf(shop, liner),
            curler: await levelsOf(shop, curler),
          },
          customer: {
            orderCount: (customer.body as Figures['customer']).orderCount,
            totalSpent: (customer.body as Figures['customer']).totalSpent,
          },
          sales: {
            orders: totals.orders,
            revenue: totals.revenue,
            deliveryCharges: totals.deliveryCharges,
            costOfGoods: totals.profit.costOfGoods,
            profit: totals.profit.profit,
          },
          handled: usedOf(UsageMetric.OrdersMonthly),
          fees: fees.rows.map((row) => row.amount),
        }).toEqual(expected);
        expect(usedOf(UsageMetric.OrdersDaily)).toBe(expected.handled);
        await expectLedgerAgrees(admin, shop.tenantId);
        return order;
      };
      const noSales = {
        orders: 0,
        revenue: '0.00',
        deliveryCharges: '0.00',
        costOfGoods: '0.00',
        profit: '0.00',
      };

      // Entered by staff: 3 Ruby, 1 Coral and the pack, 3,500 of items and 70 to deliver. Held, nothing moved or charged.
      const entered = await postJson(
        port,
        '/orders',
        {
          customerName: 'Rahima Akter',
          phone,
          locationId: mirpur?.id,
          deliveryAddress: 'House 12, Road 3',
          items: [
            { variantId: ruby.variantId, quantity: 3 },
            { variantId: coral.variantId, quantity: 1 },
            { variantId: pack.variantId, quantity: 1 },
          ],
        },
        shop.headers({ 'idempotency-key': randomUUID() }),
      );
      expect(entered.status, JSON.stringify(entered.body)).toBe(201);
      const orderId = (entered.body as Order).id;
      expect(entered.body).toMatchObject({ grandTotal: '3570.00', handledAt: null });
      const held: Figures = {
        order: {
          status: 'pending',
          paymentStatus: 'unverified',
          fulfillmentStatus: 'unfulfilled',
          due: '3570.00',
        },
        stock: {
          ruby: ['10.000', '3.000'],
          coral: ['4.000', '1.000'],
          liner: ['5.000', '1.000'],
          curler: ['2.000', '1.000'],
        },
        customer: { orderCount: 1, totalSpent: '0.00' },
        sales: noSales,
        handled: 0,
        fees: [],
      };
      await agrees(orderId, held);
      const stockedRuby = [
        ['purchase_receipt', '2.000', 'RUBY-SOON'],
        ['purchase_receipt', '8.000', 'RUBY-LATE'],
      ];
      expect(await movementsOf(shop, ruby)).toEqual(stockedRuby);

      // A call with no answer changes nothing but the call log.
      const unanswered = await shop.post(`/orders/${orderId}/calls`, { outcome: 'no_answer' });
      expect(unanswered.status, JSON.stringify(unanswered.body)).toBe(200);
      const afterNoAnswer = await agrees(orderId, held);
      expect(afterNoAnswer.calls.map((row) => row.outcome)).toEqual(['no_answer']);

      // A call that confirms moves the visible status alone.
      const confirming = await shop.post(`/orders/${orderId}/calls`, { outcome: 'confirmed' });
      expect(confirming.status, JSON.stringify(confirming.body)).toBe(200);
      const confirmed: Figures = { ...held, order: { ...held.order, status: 'confirmed' } };
      await agrees(orderId, confirmed);

      // Shipping asks the curler's serial; refused, it leaves everything as it was.
      const line = afterNoAnswer.items.find((row) => row.productName === 'Party set');
      const asked = await shop.post(`/orders/${orderId}/ship`, {
        courierName: 'Steadfast',
        trackingCode: 'SF-2001',
      });
      expect(asked.status).toBe(409);
      await agrees(orderId, confirmed);
      const waiting = (await shop.get(`/orders/${orderId}/serials`)).body as {
        items: { lineId: string; variantId: string; inStock: string[] }[];
      };
      expect(waiting.items).toHaveLength(1);
      expect(waiting.items[0]).toMatchObject({ lineId: line?.id, variantId: curler.variantId });
      expect([...(waiting.items[0]?.inStock ?? [])].sort()).toEqual(['CRL-1', 'CRL-2']);

      // Shipped: earliest expiry first, so RUBY-SOON's 2 then 1 of RUBY-LATE; counted once, and 1.5% of 3,570 charged.
      const balanceBefore = await balanceOf(shop.tenantId);
      const sending = {
        courierName: 'Steadfast',
        trackingCode: 'SF-2001',
        serials: [{ lineId: line?.id, variantId: curler.variantId, serials: ['CRL-2'] }],
      };
      const sent = await shop.post(`/orders/${orderId}/ship`, sending);
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body).toMatchObject({ courierName: 'Steadfast', trackingCode: 'SF-2001' });
      expect((sent.body as Order).handledAt).not.toBeNull();
      const shippedFigures: Figures = {
        order: {
          status: 'shipped',
          paymentStatus: 'unverified',
          fulfillmentStatus: 'shipped',
          due: '3570.00',
        },
        stock: {
          ruby: ['7.000', '0.000'],
          coral: ['3.000', '0.000'],
          liner: ['4.000', '0.000'],
          curler: ['1.000', '0.000'],
        },
        customer: { orderCount: 1, totalSpent: '0.00' },
        sales: noSales,
        handled: 1,
        fees: ['-53.55'],
      };
      await agrees(orderId, shippedFigures);
      expect(await balanceOf(shop.tenantId)).toBeCloseTo(balanceBefore - 53.55, 2);
      expect(await batchesOf(shop, lipstick.id)).toMatchObject({
        'RUBY-LATE': '7.000',
        'CORAL-1': '3.000',
      });
      const shippedRuby = [
        ['sale', '-1.000', 'RUBY-LATE'],
        ['sale', '-2.000', 'RUBY-SOON'],
        ...stockedRuby,
      ];
      expect(await movementsOf(shop, ruby)).toEqual(shippedRuby);
      const sold = await admin.query<{ serial: string; sold_order_id: string }>(
        `SELECT serial, sold_order_id FROM tenant.serial_numbers WHERE tenant_id = $1 AND status = 'sold'`,
        [shop.tenantId],
      );
      expect(sold.rows).toEqual([{ serial: 'CRL-2', sold_order_id: orderId }]);

      // Sending it again is refused: still counted once, charged once.
      expect((await shop.post(`/orders/${orderId}/ship`, sending)).status).toBe(409);
      await agrees(orderId, shippedFigures);

      // Delivered: the cash collected, so nothing is due. It joins the customer's total and the sales, at 3,500 of
      // items with the 70 apart, less 3 x 240 + 150 + 100 + 900 = 1,870 of cost. No second count or fee.
      const delivered = await shop.post(`/orders/${orderId}/deliver`, {});
      expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
      const deliveredFigures: Figures = {
        order: {
          status: 'delivered',
          paymentStatus: 'paid',
          fulfillmentStatus: 'delivered',
          due: '0.00',
        },
        stock: shippedFigures.stock,
        customer: { orderCount: 1, totalSpent: '3570.00' },
        sales: {
          orders: 1,
          revenue: '3500.00',
          deliveryCharges: '70.00',
          costOfGoods: '1870.00',
          profit: '1630.00',
        },
        handled: 1,
        fees: ['-53.55'],
      };
      await agrees(orderId, deliveredFigures);

      // Two Ruby back: one sellable into the batch expiring soonest, one damaged and written off. Sales lose both units'
      // 1,000 and both units' 240 of cost, as neither was kept (INV-18); the damaged unit's 240 is a loss, reported apart.
      // The order is still delivered, the customer's total its grand total (CUS-01), and the fee is not refunded (PYG-04).
      const rubyLine = afterNoAnswer.items.find((row) =>
        row.productName.includes('Matte lipstick'),
      );
      const back = await shop.post(`/orders/${orderId}/returns`, {
        items: [{ lineId: rubyLine?.id, sellable: 1, damaged: 1 }],
      });
      expect(back.status, JSON.stringify(back.body)).toBe(200);
      const returned = await agrees(orderId, {
        ...deliveredFigures,
        stock: { ...shippedFigures.stock, ruby: ['8.000', '0.000'] },
        sales: {
          orders: 1,
          revenue: '2500.00',
          deliveryCharges: '70.00',
          costOfGoods: '1390.00',
          profit: '1110.00',
        },
      });
      expect(returned.items.find((row) => row.id === rubyLine?.id)?.returnedQuantity).toBe('2.000');
      expect(await batchesOf(shop, lipstick.id)).toMatchObject({
        'RUBY-SOON': '1.000',
        'RUBY-LATE': '7.000',
      });
      expect(await movementsOf(shop, ruby)).toEqual([
        ['damaged', '-1.000', 'RUBY-SOON'],
        ['return_received', '2.000', 'RUBY-SOON'],
        ...shippedRuby,
      ]);
      // The stock's own figures say the same: 8 x 240 + 3 x 150 + 4 x 100 + 900 held, the same cost of goods, one loss.
      const figures = await shop.get(`/inventory/figures?dateFrom=${today}&dateTo=${today}`);
      expect(figures.status, JSON.stringify(figures.body)).toBe(200);
      expect(figures.body).toMatchObject({
        stockValue: { value: '3670.00' },
        costOfGoodsSold: { value: '1390.00' },
        losses: { value: '240.00', byReason: [{ reason: 'damaged', value: '240.00' }] },
      });

      // The record of it: every move, in order, on the two axes and the visible status.
      expect(
        returned.history
          .filter((row) => row.field !== 'return' && row.field !== 'call')
          .map((row) => [row.field, row.to]),
      ).toEqual([
        ['created', 'pending'],
        ['confirmed', 'confirmed'],
        ['fulfillment_status', 'shipped'],
        ['payment_status', 'paid'],
        ['fulfillment_status', 'delivered'],
      ]);
    },
    SLOW,
  );
});
