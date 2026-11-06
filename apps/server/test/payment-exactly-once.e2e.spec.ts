import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import type { HttpResult } from './support/http';
import { PrepaidPath, receiptOf, trx, type PrepaidShop } from './support/prepaid-path';
import { SmsCapture } from './support/sms-capture';

// PHASE-5-PLAN §1, exit criterion 4, and §8's rule that every path verifying, cancelling, refunding or charging a fee is run twice
// at once from two callers: money moves exactly once. Each test sends its two calls together and then reads what the database
// holds -- the payments, the transaction ID's register, the fees, the order -- whichever call won. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_exactly_once_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STOREFRONT_SECRET = 'payment-exactly-once-e2e-storefront-secret-0123456789';
const SLOW = 60_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let path: PrepaidPath;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-exactly-once-e2e-otp-secret-01234';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(PaymentSessionExpiryTickWorker)
    .useValue({})
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  path = new PrepaidPath(port, admin, texts, STOREFRONT_SECRET);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
  delete process.env['STOREFRONT_SECRET'];
});

function statusesOf(results: HttpResult[]): number[] {
  return results.map((row) => row.status).sort((a, b) => a - b);
}

interface Order {
  status: string;
  paymentStatus: string;
  grandTotal: string;
  due: string;
  cancelReason: string | null;
  payments: {
    id: string;
    amount: string;
    voided: object | null;
    refunded: object | null;
  }[];
  history: { field: string; to: string | null }[];
}

async function orderOf(setup: PrepaidShop, orderId: string): Promise<Order> {
  const read = await setup.shop.get(`/orders/${orderId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as Order;
}

/** What the order's live payments come to, in paisa, and that it agrees with what the order says is due. */
function paidOf(order: Order): number {
  const paid = order.payments
    .filter((row) => row.voided === null && row.refunded === null)
    .reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  expect(Math.round(Number(order.grandTotal) * 100) - paid).toBe(
    Math.round(Number(order.due) * 100),
  );
  return paid;
}

async function registered(transactionId: string): Promise<number> {
  const { rows } = await admin.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM control.used_transaction_ids WHERE transaction_id = upper($1)',
    [transactionId],
  );
  return Number(rows[0]?.count);
}

async function stateOf(sessionId: string): Promise<string | undefined> {
  const { rows } = await admin.query<{ state: string }>(
    'SELECT state FROM tenant.payment_sessions WHERE id = $1',
    [sessionId],
  );
  return rows[0]?.state;
}

describeIfDatabase('exactly once (PHASE-5-PLAN §1, exit criterion 4)', () => {
  it(
    'takes one transaction ID typed at two shops at the same moment as one payment, in one shop',
    async () => {
      const [first, second] = await Promise.all([path.shop('oncea'), path.shop('onceb')]);
      const [one, two] = await Promise.all([path.landingOrder(first), path.landingOrder(second)]);
      const id = trx();
      const typed = await Promise.all([path.typeId(one.ref, id), path.typeId(two.ref, id)]);
      for (const row of typed) expect([201, 409]).toContain(row.status);
      // Both shops' staff verify what their page took, at once: one payment comes of it, wherever it landed.
      const decided = await Promise.all(
        [
          { setup: first, order: one, typed: typed[0] },
          { setup: second, order: two, typed: typed[1] },
        ]
          .filter((row) => row.typed.status === 201)
          .map((row) => row.setup.shop.post(`/payments/${row.order.sessionId}/verify`, {})),
      );
      expect(decided.filter((row) => row.status === 200)).toHaveLength(1);
      expect(await path.paymentsWith(id)).toHaveLength(1);
      expect(await registered(id)).toBe(1);
      const states = [await stateOf(one.sessionId), await stateOf(two.sessionId)];
      expect(states.filter((state) => state === 'verified')).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'records one payment when staff verify the same payment twice at the same moment',
    async () => {
      const setup = await path.shop('oncev');
      const placed = await path.landingOrder(setup);
      expect((await path.typeId(placed.ref, trx())).status).toBe(201);
      const verify = (): Promise<HttpResult> =>
        setup.shop.post(`/payments/${placed.sessionId}/verify`, {});
      expect(statusesOf(await Promise.all([verify(), verify()]))).toEqual([200, 409]);
      const order = await orderOf(setup, placed.orderId);
      expect(paidOf(order)).toBe(30_000);
      expect(order).toMatchObject({ paymentStatus: 'paid', due: '770.00' });
      expect(order.history.filter((row) => row.field === 'payment_status')).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'lets one decision stand when staff verify and reject the same payment at the same moment',
    async () => {
      const setup = await path.shop('oncer');
      const placed = await path.landingOrder(setup);
      expect((await path.typeId(placed.ref, trx())).status).toBe(201);
      const [verified, rejected] = await Promise.all([
        setup.shop.post(`/payments/${placed.sessionId}/verify`, {}),
        setup.shop.post(`/payments/${placed.sessionId}/reject`, { reason: 'no_payment_found' }),
      ]);
      expect(statusesOf([verified, rejected])).toEqual([200, 409]);
      const order = await orderOf(setup, placed.orderId);
      if (verified.status === 200) {
        expect(paidOf(order)).toBe(30_000);
        expect(order.status).not.toBe('cancelled');
        expect(await stateOf(placed.sessionId)).toBe('verified');
      } else {
        expect(paidOf(order)).toBe(0);
        expect(order).toMatchObject({ status: 'cancelled' });
        expect(await stateOf(placed.sessionId)).not.toBe('verified');
      }
    },
    SLOW,
  );

  it(
    "verifies once and charges the listener's fee once when two phones forward one receipt at the same moment",
    async () => {
      const setup = await path.shop('oncep');
      const [phoneA, phoneB] = [await path.pairPhone(setup.shop), await path.pairPhone(setup.shop)];
      const placed = await path.landingOrder(setup);
      const id = trx();
      expect((await path.typeId(placed.ref, id)).status).toBe(201);
      const receipt = receiptOf(id);
      const sent = await Promise.all([
        path.forward(phoneA, receipt),
        path.forward(phoneB, receipt),
      ]);
      expect(statusesOf(sent)).toEqual([200, 200]);
      expect(await path.paymentsWith(id)).toHaveLength(1);
      expect(await path.feesOf(setup.shop.tenantId)).toEqual(['-0.30']);
      expect(paidOf(await orderOf(setup, placed.orderId))).toBe(30_000);
      const { rows } = await admin.query<{ status: string }>(
        'SELECT status FROM tenant.listener_messages WHERE tenant_id = $1',
        [setup.shop.tenantId],
      );
      expect(rows.map((row) => row.status).sort()).toEqual(['duplicate', 'matched']);
    },
    SLOW,
  );

  it(
    'never takes more than is due when staff record money by hand while the session verifies',
    async () => {
      const setup = await path.shop('onceh');
      const placed = await path.landingOrder(setup);
      expect((await path.typeId(placed.ref, trx())).status).toBe(201);
      // The whole 1,070 TK by hand, and the 300 TK advance verified, together: both can't fit.
      const [byHand, verified] = await Promise.all([
        setup.shop.post(`/orders/${placed.orderId}/payments`, { method: 'cash', amount: 1070 }),
        setup.shop.post(`/payments/${placed.sessionId}/verify`, {}),
      ]);
      const won = [byHand.status === 201, verified.status === 200].filter(Boolean);
      expect(won).toHaveLength(1);
      expect([byHand.status, verified.status]).toContain(409);
      const order = await orderOf(setup, placed.orderId);
      expect(paidOf(order)).toBe(byHand.status === 201 ? 107_000 : 30_000);
      expect(Number(order.due)).toBeGreaterThanOrEqual(0);
    },
    SLOW,
  );

  it(
    'refunds a payment once when staff mark it refunded twice at the same moment',
    async () => {
      const setup = await path.shop('oncef');
      const placed = await path.landingOrder(setup);
      expect((await path.typeId(placed.ref, trx())).status).toBe(201);
      expect((await setup.shop.post(`/payments/${placed.sessionId}/verify`, {})).status).toBe(200);
      const paymentId = (await orderOf(setup, placed.orderId)).payments[0]?.id ?? '';
      const refund = (): Promise<HttpResult> =>
        setup.shop.post(`/orders/${placed.orderId}/payments/${paymentId}/refund`, {
          note: 'Sent back by bKash',
        });
      expect(statusesOf(await Promise.all([refund(), refund()]))).toEqual([200, 409]);
      const order = await orderOf(setup, placed.orderId);
      expect(paidOf(order)).toBe(0);
      expect(order.payments.filter((row) => row.refunded !== null)).toHaveLength(1);
      const { rows } = await admin.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'order_payment_refunded'",
        [setup.shop.tenantId],
      );
      expect(rows[0]?.count).toBe('1');
    },
    SLOW,
  );
});
