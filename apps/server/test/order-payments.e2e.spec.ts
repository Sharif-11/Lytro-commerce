import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.3b, read agreed 2026-10-30: the payments staff record on an order (ORD-15) -- cash, a wallet with its
// sender and transaction ID, a bank transfer with its reference -- or with a new order (ORD-22), never above what is
// due; a payment recorded by mistake voided with its reason; and what is due and the payment status worked out from the
// live payments (ORD-06, ORD-43). A transaction ID is unique across the platform. Runs only when DATABASE_TEST_ADMIN_URL
// is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_order_payments_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'order-payments-e2e-otp-secret-0123456789abcd';
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

interface Payment {
  id: string;
  method: string;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: { id: string; name: string | null } | null;
  voided: { by: { id: string } | null; at: string; reason: string } | null;
}

interface Order {
  id: string;
  status: string;
  paymentStatus: string;
  grandTotal: string;
  advanceDue: string;
  due: string;
  items: { id: string; variantId: string; quantity: string }[];
  history: { field: string; from: string | null; to: string | null; note: string | null }[];
  payments: Payment[];
}

interface Locations {
  zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}
let mirpur: number | null = null;

async function mirpurId(shop: ShopClient): Promise<number> {
  if (mirpur === null) {
    const locations = (await shop.get('/locations')).body as Locations;
    mirpur =
      locations.zillas
        .find((row) => row.nameEn === 'Dhaka')
        ?.thanas.find((row) => row.nameEn === 'Mirpur')?.id ?? null;
  }
  if (mirpur === null) throw new Error('no thana Dhaka/Mirpur');
  return mirpur;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

function freshTrx(): string {
  return `TRX${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 50 }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

async function enter(
  shop: ShopClient,
  body: Record<string, unknown>,
  headers: Record<string, string> = shop.headers(),
  key = randomUUID(),
): Promise<HttpResult> {
  return postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: freshMobile(),
      locationId: await mirpurId(shop),
      deliveryAddress: 'House 12, Road 3',
      ...body,
    },
    { ...headers, 'idempotency-key': key },
  );
}

/** Two 300 TK lamps to Mirpur: 670 TK with the home zone's 70. */
async function place(shop: ShopClient, variantId: string, quantity = 2): Promise<Order> {
  const made = await enter(shop, { items: [{ variantId, quantity }] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

function pay(shop: ShopClient, order: Order, body: Record<string, unknown>): Promise<HttpResult> {
  return shop.post(`/orders/${order.id}/payments`, body);
}

async function paid(shop: ShopClient, order: Order, body: Record<string, unknown>): Promise<Order> {
  const result = await pay(shop, order, body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Order;
}

function bkash(amount: number, transactionId = freshTrx()): Record<string, unknown> {
  return { method: 'bkash', amount, senderNumber: freshMobile(), transactionId };
}

function voidPayment(
  shop: ShopClient,
  order: Order,
  paymentId: string,
  reason = 'Typed on the wrong order',
): Promise<HttpResult> {
  return shop.post(`/orders/${order.id}/payments/${paymentId}/void`, { reason });
}

async function activity(tenantId: string, action: AuditAction): Promise<number> {
  const result = await admin.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
    [tenantId, action],
  );
  return result.rows[0]?.n ?? 0;
}

async function ordersOf(tenantId: string): Promise<number> {
  const result = await admin.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tenant.orders WHERE tenant_id = $1',
    [tenantId],
  );
  return result.rows[0]?.n ?? 0;
}

describeIfDatabase('recording payments on an order (ORD-15, ORD-43)', () => {
  it('takes a wallet payment off what is due: partially paid, then paid with nothing due', async () => {
    const shop = await openShop(port, texts, 'pay');
    const order = await place(shop, await product(shop, 'Lamp', 300));
    expect(order).toMatchObject({
      paymentStatus: 'unverified',
      grandTotal: '670.00',
      due: '670.00',
    });
    const trx = freshTrx();
    const part = await paid(shop, order, bkash(200, trx));
    expect(part).toMatchObject({ paymentStatus: 'partially_paid', due: '470.00' });
    expect(part.payments).toHaveLength(1);
    expect(part.payments[0]).toMatchObject({
      method: 'bkash',
      amount: '200.00',
      transactionId: trx,
      voided: null,
    });
    expect(part.payments[0]?.verifiedBy?.id).toEqual(expect.any(String));
    expect(part.history.at(-1)).toMatchObject({
      field: 'payment_status',
      from: 'unverified',
      to: 'partially_paid',
      note: '200.00 TK bkash',
    });
    const rest = await paid(shop, part, { method: 'cash', amount: 470 });
    expect(rest).toMatchObject({ paymentStatus: 'paid', due: '0.00' });
    expect(rest.payments.map((row) => [row.method, row.transactionId])).toEqual([
      ['bkash', trx],
      ['cash', null],
    ]);
    expect(await activity(shop.tenantId, AuditAction.OrderPaymentRecorded)).toBe(2);
  });

  it('asks a wallet for its sender and transaction ID, a bank for its reference, and cash for neither', async () => {
    const shop = await openShop(port, texts, 'pay');
    const order = await place(shop, await product(shop, 'Lamp', 300));
    const noSender = await pay(shop, order, {
      method: 'nagad',
      amount: 100,
      transactionId: freshTrx(),
    });
    expect(noSender.status).toBe(400);
    expect(fieldsOf(noSender)).toEqual({ senderNumber: 'required' });
    const noReference = await pay(shop, order, { method: 'bank', amount: 100 });
    expect(fieldsOf(noReference)).toEqual({ transactionId: 'required' });
    const cashWithId = await pay(shop, order, {
      method: 'cash',
      amount: 100,
      transactionId: freshTrx(),
    });
    expect(fieldsOf(cashWithId)).toEqual({ transactionId: 'not_allowed' });
    expect(fieldsOf(await pay(shop, order, { method: 'cash', amount: 0 }))).toEqual({
      amount: 'too_small',
    });
    expect((await pay(shop, order, { method: 'cash_on_delivery', amount: 100 })).status).toBe(400);
    const bank = await paid(shop, order, {
      method: 'bank',
      amount: 100,
      transactionId: freshTrx(),
    });
    expect(bank.payments[0]).toMatchObject({ method: 'bank', senderNumber: null });
  });

  it('refuses more than is due, anything once nothing is, and a cancelled order', async () => {
    const shop = await openShop(port, texts, 'pay');
    const lamp = await product(shop, 'Lamp', 300);
    const order = await place(shop, lamp);
    const over = await pay(shop, order, { method: 'cash', amount: 670.01 });
    expect(over.status).toBe(409);
    expect(fieldsOf(over)).toEqual({ amount: 'out_of_range' });
    expect(errorOf(over).message).toContain('৳670');
    expect(errorOf(over).details).toMatchObject({ due: '670.00' });
    await paid(shop, order, { method: 'cash', amount: 670 });
    const nothing = await pay(shop, order, { method: 'cash', amount: 1 });
    expect(nothing.status).toBe(409);
    expect(errorOf(nothing).message).toBe('এই অর্ডারে কোনো ডিউ নেই।');
    const cancelled = await place(shop, lamp);
    expect(
      (await shop.post(`/orders/${cancelled.id}/cancel`, { reason: 'customer_cancelled' })).status,
    ).toBe(200);
    expect((await pay(shop, cancelled, { method: 'cash', amount: 10 })).status).toBe(409);
  });

  it('marks a required-advance order paid once the advance is met, the rest still due on delivery', async () => {
    const shop = await openShop(port, texts, 'pay');
    const phone = await product(shop, 'Phone', 15000, {
      paymentPolicy: 'partial_advance',
      advanceAmount: 300,
    });
    const order = await place(shop, phone, 1);
    expect(order).toMatchObject({ grandTotal: '15070.00', advanceDue: '300.00' });
    const some = await paid(shop, order, bkash(100));
    expect(some.paymentStatus).toBe('partially_paid');
    const advance = await paid(shop, some, bkash(200));
    expect(advance).toMatchObject({ paymentStatus: 'paid', due: '14770.00' });
    expect(
      (
        await shop.post(`/orders/${order.id}/ship`, {
          courierName: 'Steadfast',
          trackingCode: 'SF-1',
        })
      ).status,
    ).toBe(200);
    const delivered = await shop.post(`/orders/${order.id}/deliver`, {});
    expect(delivered.body).toMatchObject({ paymentStatus: 'paid', due: '0.00' });
    expect((delivered.body as Order).payments.at(-1)).toMatchObject({
      method: 'cash_on_delivery',
      amount: '14770.00',
    });
  });

  it('works what is due out again when the items change, and refuses a total below what is paid', async () => {
    const shop = await openShop(port, texts, 'pay');
    const lamp = await product(shop, 'Lamp', 300);
    const order = await paid(shop, await place(shop, lamp), { method: 'cash', amount: 670 });
    expect(order.paymentStatus).toBe('paid');
    const [line] = order.items;
    const more = await shop.patch(`/orders/${order.id}`, {
      items: [{ lineId: line?.id, variantId: lamp, quantity: 3 }],
    });
    expect(more.status, JSON.stringify(more.body)).toBe(200);
    expect(more.body).toMatchObject({
      grandTotal: '970.00',
      due: '300.00',
      paymentStatus: 'partially_paid',
    });
    expect((more.body as Order).history.at(-1)).toMatchObject({
      field: 'payment_status',
      from: 'paid',
      to: 'partially_paid',
    });
    const fewer = await shop.patch(`/orders/${order.id}`, {
      items: [{ lineId: line?.id, variantId: lamp, quantity: 1 }],
    });
    expect(fewer.status).toBe(409);
    expect(errorOf(fewer).message).toContain('৳670');
    const notes = await shop.patch(`/orders/${order.id}`, { notes: 'Ring first' });
    expect(notes.body).toMatchObject({ due: '300.00', paymentStatus: 'partially_paid' });
  });

  it('needs payments:manage, and answers 404 for another shop’s order (SEC-02)', async () => {
    const shop = await openShop(port, texts, 'pay');
    const other = await openShop(port, texts, 'pay');
    const order = await place(shop, await product(shop, 'Lamp', 300));
    expect((await pay(other, order, { method: 'cash', amount: 10 })).status).toBe(404);
    const clerk = await staffWith(port, texts, admin, shop, ['orders:read', 'orders:manage']);
    const refused = await postJson(
      port,
      `/orders/${order.id}/payments`,
      { method: 'cash', amount: 10 },
      clerk,
    );
    expect(refused.status).toBe(403);
    // A Starter shop seats one staff member, so the cashier works at the other shop.
    const theirs = await place(other, await product(other, 'Mug', 200));
    const cashier = await staffWith(port, texts, admin, other, ['payments:manage']);
    const taken = await postJson(
      port,
      `/orders/${theirs.id}/payments`,
      { method: 'cash', amount: 10 },
      cashier,
    );
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);
    expect((taken.body as Order).payments[0]?.verifiedBy?.id).not.toBeNull();
  });
});

describeIfDatabase(
  'a transaction ID is used once, platform-wide (ORD-15, agreed 2026-10-30)',
  () => {
    it('refuses an ID already on a live payment of the shop or used by another shop', async () => {
      const shop = await openShop(port, texts, 'trx');
      const other = await openShop(port, texts, 'trx');
      const lamp = await product(shop, 'Lamp', 300);
      const trx = freshTrx();
      await paid(shop, await place(shop, lamp), bkash(100, trx));
      const again = await pay(shop, await place(shop, lamp), bkash(100, trx));
      expect(again.status).toBe(409);
      expect(fieldsOf(again)).toEqual({ transactionId: 'already_used' });
      const theirs = await pay(other, await place(other, await product(other, 'Mug', 200)), {
        method: 'bank',
        amount: 50,
        transactionId: trx,
      });
      expect(theirs.status).toBe(409);
      expect(fieldsOf(theirs)).toEqual({ transactionId: 'already_used' });
    });

    it('lets the shop record a voided payment’s ID again, never another shop', async () => {
      const shop = await openShop(port, texts, 'trx');
      const other = await openShop(port, texts, 'trx');
      const lamp = await product(shop, 'Lamp', 300);
      const trx = freshTrx();
      const wrong = await paid(shop, await place(shop, lamp), bkash(100, trx));
      expect((await voidPayment(shop, wrong, wrong.payments[0]?.id ?? '')).status).toBe(200);
      const theirs = await pay(other, await place(other, await product(other, 'Mug', 200)), {
        method: 'bank',
        amount: 50,
        transactionId: trx,
      });
      expect(theirs.status).toBe(409);
      const right = await paid(shop, await place(shop, lamp), bkash(100, trx));
      expect(right.payments[0]).toMatchObject({ transactionId: trx, voided: null });
      expect((await pay(shop, await place(shop, lamp), bkash(100, trx))).status).toBe(409);
    });

    it('refuses an ID the shop used to pay Lytro (BIL-07)', async () => {
      const shop = await openShop(port, texts, 'trx');
      const trx = freshTrx();
      await admin.query(
        'INSERT INTO control.used_transaction_ids (transaction_id, tenant_id) VALUES ($1, $2)',
        [trx, shop.tenantId],
      );
      const order = await place(shop, await product(shop, 'Lamp', 300));
      const refused = await pay(shop, order, bkash(100, trx));
      expect(refused.status).toBe(409);
      expect(fieldsOf(refused)).toEqual({ transactionId: 'already_used' });
    });

    it('registers the ID with the payment, and not when the payment is refused', async () => {
      const shop = await openShop(port, texts, 'trx');
      const order = await place(shop, await product(shop, 'Lamp', 300));
      const trx = freshTrx();
      expect((await pay(shop, order, bkash(5000, trx))).status).toBe(409);
      const registered = async (): Promise<string[]> =>
        (
          await admin.query<{ tenant_id: string }>(
            'SELECT tenant_id FROM control.used_transaction_ids WHERE transaction_id = $1',
            [trx],
          )
        ).rows.map((row) => row.tenant_id);
      expect(await registered()).toEqual([]);
      await paid(shop, order, bkash(100, trx));
      expect(await registered()).toEqual([shop.tenantId]);
    });
  },
);

describeIfDatabase('voiding a payment recorded by mistake (agreed 2026-10-30)', () => {
  it('keeps it in the payments marked void, and puts what is due back up', async () => {
    const shop = await openShop(port, texts, 'void');
    const order = await place(shop, await product(shop, 'Lamp', 300));
    const full = await paid(shop, await paid(shop, order, bkash(600)), {
      method: 'cash',
      amount: 70,
    });
    expect(full.paymentStatus).toBe('paid');
    const [wallet, cash] = full.payments;
    const back = await voidPayment(shop, full, cash?.id ?? '', 'Counted twice');
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body).toMatchObject({ paymentStatus: 'partially_paid', due: '70.00' });
    const voided = (back.body as Order).payments[1];
    expect(voided).toMatchObject({
      id: cash?.id,
      amount: '70.00',
      voided: { reason: 'Counted twice' },
    });
    expect(voided?.voided?.by?.id).toEqual(expect.any(String));
    expect((back.body as Order).history.at(-1)).toMatchObject({
      field: 'payment_status',
      from: 'paid',
      to: 'partially_paid',
      note: '70.00 TK cash voided: Counted twice',
    });
    const none = await voidPayment(shop, full, wallet?.id ?? '');
    expect(none.body).toMatchObject({ paymentStatus: 'unverified', due: '670.00' });
    expect((await voidPayment(shop, full, wallet?.id ?? '')).status).toBe(409);
    expect(await activity(shop.tenantId, AuditAction.OrderPaymentVoided)).toBe(2);
  });

  it('never voids the cash on delivery a delivery collected', async () => {
    const shop = await openShop(port, texts, 'void');
    const order = await place(shop, await product(shop, 'Lamp', 300));
    await shop.post(`/orders/${order.id}/ship`, { courierName: 'Steadfast', trackingCode: 'SF-2' });
    const delivered = (await shop.post(`/orders/${order.id}/deliver`, {})).body as Order;
    const cod = delivered.payments[0];
    expect(cod?.method).toBe('cash_on_delivery');
    const refused = await voidPayment(shop, delivered, cod?.id ?? '');
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('ক্যাশ অন ডেলিভারি');
  });

  it('answers 404 for a payment of another order or shop, and leaves it live (SEC-02)', async () => {
    const shop = await openShop(port, texts, 'void');
    const other = await openShop(port, texts, 'void');
    const lamp = await product(shop, 'Lamp', 300);
    const order = await paid(shop, await place(shop, lamp), bkash(100));
    const paymentId = order.payments[0]?.id ?? '';
    expect((await voidPayment(other, order, paymentId)).status).toBe(404);
    const elsewhere = await place(shop, lamp);
    expect((await voidPayment(shop, elsewhere, paymentId)).status).toBe(404);
    expect((await voidPayment(shop, order, 'not-a-payment')).status).toBe(404);
    const clerk = await staffWith(port, texts, admin, shop, ['orders:read', 'orders:manage']);
    const refused = await postJson(
      port,
      `/orders/${order.id}/payments/${paymentId}/void`,
      { reason: 'No' },
      clerk,
    );
    expect(refused.status).toBe(403);
    const still = (await shop.get(`/orders/${order.id}`)).body as Order;
    expect(still).toMatchObject({ paymentStatus: 'partially_paid', due: '570.00' });
    expect(still.payments[0]?.voided).toBeNull();
  });

  it('keeps a payment as recorded in the database: only voided, and only once', async () => {
    const shop = await openShop(port, texts, 'void');
    const order = await paid(shop, await place(shop, await product(shop, 'Lamp', 300)), bkash(100));
    const paymentId = order.payments[0]?.id ?? '';
    expect((await voidPayment(shop, order, paymentId)).status).toBe(200);
    await expect(
      admin.query('UPDATE tenant.payments SET voided_at = NULL, void_reason = NULL WHERE id = $1', [
        paymentId,
      ]),
    ).rejects.toThrow(/a voided payment stays void/);
    const grants = await admin.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.column_privileges WHERE table_schema = 'tenant' AND table_name = 'payments' AND grantee = 'lytronix_app' AND privilege_type = 'UPDATE' ORDER BY column_name",
    );
    expect(grants.rows.map((row) => row.column_name)).toEqual([
      'void_reason',
      'voided_at',
      'voided_by',
    ]);
  });
});

describeIfDatabase('a payment received with a new order (ORD-22, agreed 2026-10-30)', () => {
  it('saves the order and its verified payment together, the payment taken off what is due', async () => {
    const shop = await openShop(port, texts, 'new');
    const lamp = await product(shop, 'Lamp', 300);
    const made = await enter(shop, {
      items: [{ variantId: lamp, quantity: 2 }],
      payment: bkash(500),
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({
      status: 'pending',
      paymentStatus: 'partially_paid',
      due: '170.00',
      payments: [{ method: 'bkash', amount: '500.00', voided: null }],
    });
    expect((made.body as Order).history.map((row) => [row.field, row.to])).toEqual([
      ['created', 'pending'],
      ['payment_status', 'partially_paid'],
    ]);
    expect(await activity(shop.tenantId, AuditAction.OrderCreated)).toBe(1);
    expect(await activity(shop.tenantId, AuditAction.OrderPaymentRecorded)).toBe(1);
  });

  it('replays the same reply for the same key, recording the payment once', async () => {
    const shop = await openShop(port, texts, 'new');
    const lamp = await product(shop, 'Lamp', 300);
    const key = randomUUID();
    const body = {
      customerName: 'Rahima Akter',
      phone: freshMobile(),
      locationId: await mirpurId(shop),
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId: lamp, quantity: 2 }],
      payment: { method: 'cash', amount: 670 },
    };
    const first = await postJson(port, '/orders', body, shop.headers({ 'idempotency-key': key }));
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ paymentStatus: 'paid', due: '0.00' });
    const second = await postJson(port, '/orders', body, shop.headers({ 'idempotency-key': key }));
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect((second.body as Order).id).toBe((first.body as Order).id);
    const rows = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tenant.payments WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it('saves nothing when the payment is refused: above the total, or an ID already used', async () => {
    const shop = await openShop(port, texts, 'new');
    const lamp = await product(shop, 'Lamp', 300);
    const over = await enter(shop, {
      items: [{ variantId: lamp, quantity: 2 }],
      payment: { method: 'cash', amount: 700 },
    });
    expect(over.status).toBe(409);
    expect(fieldsOf(over)).toEqual({ 'payment.amount': 'out_of_range' });
    const trx = freshTrx();
    await paid(shop, await place(shop, lamp), bkash(100, trx));
    const used = await enter(shop, {
      items: [{ variantId: lamp, quantity: 2 }],
      payment: bkash(100, trx),
    });
    expect(used.status).toBe(409);
    expect(fieldsOf(used)).toEqual({ 'payment.transactionId': 'already_used' });
    const invalid = await enter(shop, {
      items: [{ variantId: lamp, quantity: 2 }],
      payment: { method: 'rocket', amount: 100 },
    });
    expect(fieldsOf(invalid)).toEqual({
      'payment.senderNumber': 'required',
      'payment.transactionId': 'required',
    });
    expect(await ordersOf(shop.tenantId)).toBe(1);
  });

  it('needs payments:manage as well as orders:manage', async () => {
    const shop = await openShop(port, texts, 'new');
    const lamp = await product(shop, 'Lamp', 300);
    const clerk = await staffWith(port, texts, admin, shop, ['orders:read', 'orders:manage']);
    const refused = await enter(
      shop,
      { items: [{ variantId: lamp, quantity: 1 }], payment: { method: 'cash', amount: 100 } },
      clerk,
    );
    expect(refused.status).toBe(403);
    expect(errorOf(refused).details).toMatchObject({ permission: 'payments:manage' });
    expect(await ordersOf(shop.tenantId)).toBe(0);
    const plain = await enter(shop, { items: [{ variantId: lamp, quantity: 1 }] }, clerk);
    expect(plain.status, JSON.stringify(plain.body)).toBe(201);
  });
});
