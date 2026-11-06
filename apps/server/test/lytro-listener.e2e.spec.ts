import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import { PlatformWalletsService } from '../src/modules/balance/services/platform-wallets.service';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { ListenerDevices } from '../src/modules/listener/services/listener-devices';
import { ListenerPairing } from '../src/modules/listener/services/listener-pairing';
import { LISTENER_CLOCK } from '../src/modules/listener/tokens';
import { ListenerReceipts } from '../src/modules/listener-receipts/services/listener-receipts';
import { LytroReceipts } from '../src/modules/lytro-receipts/services/lytro-receipts';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.6, read agreed 2026-11-03: Lytro's own listener phone verifies what sellers type in the dashboard's wallet
// step -- plans and top-ups, with no fee and no cap (PAY-21, D5-3 changed, BIL-05, BAL-03). A wrong amount never activates
// by itself; a top-up credits what arrived, and a plan's money may go on the balance instead (BIL-06). Money for a closed
// request activates nothing (BIL-15). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_lytro_listener_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const OPERATOR_ID = randomUUID();
const VERSION = '1.0.0';
const SENDER = '01811000002';
const MINUTE = 60_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let queue: PaymentQueueService;
let termId = '';
let planId = '';
let clockShift = 0;
const texts = new SmsCapture();

const visitorIp = {
  resolve(request: HttpRequest): string | null {
    return headerValue(request.headers['x-test-visitor']) ?? request.ip ?? null;
  },
  context(request: HttpRequest): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: headerValue(request.headers['user-agent']) ?? null,
      ip: visitorIp.resolve(request),
    };
  },
};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'lytro-listener-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Lytro listener month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  planId =
    (
      await admin.query<{ id: string }>(
        'INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, 970, true, $2) RETURNING id',
        [
          'Lytro listener plan',
          JSON.stringify({ products: 100, staff: 3, storage_mb: 100, bandwidth_gb: 10 }),
        ],
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [planId, termId, '449.00'],
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(LISTENER_CLOCK)
    .useValue(() => new Date(Date.now() + clockShift))
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  queue = app.get(PaymentQueueService);
  await app.get(PlatformWalletsService).create(
    {
      provider: 'bKash',
      number: '01700000000',
      label: 'Personal',
      enabled: true,
      displayOrder: 0,
    },
    OPERATOR_ID,
  );
  await app.get(PlatformWalletsService).create(
    {
      provider: 'Nagad',
      number: '01700000001',
      label: 'Personal',
      enabled: true,
      displayOrder: 1,
    },
    OPERATOR_ID,
  );
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  clockShift = 0;
});

interface Phone {
  deviceId: string;
  token: string;
  installationId: string;
  shopName: string;
  accounts: { method: string; number: string }[];
  senders: string[];
}

interface UploadResult {
  status: string | null;
  reviewReason: string | null;
  ignoredReason: string | null;
}

interface PaymentRow {
  id: string;
  kind: string;
  status: string;
  amount: string;
  verified_by: string | null;
  amount_sent: string | null;
  amount_arrived: string | null;
  review_reason: string | null;
  plan_id: string | null;
}

interface Quote {
  id: string;
  amount: string;
}

function trx(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

function receiptText(id: string, amount: string, from = SENDER): string {
  return `You have received Tk ${amount} from ${from}. Fee Tk 0.00. Balance Tk 1,500.00. TrxID ${id} at 03/11/2026 13:58`;
}

function sms(
  text: string,
  extra: { sender?: string; receivedAt?: Date } = {},
): { sender: string; text: string; receivedAt: string } {
  return {
    sender: extra.sender ?? 'bKash',
    text,
    receivedAt: (extra.receivedAt ?? new Date(Date.now() + clockShift)).toISOString(),
  };
}

async function lytroPhone(): Promise<Phone> {
  const { code } = await app.get(ListenerPairing).createLytroCode(OPERATOR_ID);
  const installationId = `install-${randomUUID()}`;
  const paired = await sendExact(
    port,
    'POST',
    '/v1/listener/pair',
    { code, installationId, model: 'Redmi 12' },
    {
      host: 'api.localhost',
      'content-type': 'application/json',
      'x-test-visitor': `198.51.100.${String(Math.floor(Math.random() * 250))}`,
      'x-app-version': VERSION,
    },
  );
  expect(paired.status, JSON.stringify(paired.body)).toBe(201);
  return { ...(paired.body as Omit<Phone, 'installationId'>), installationId };
}

function headersOf(phone: Phone): Record<string, string> {
  return {
    host: 'api.localhost',
    authorization: `Bearer ${phone.token}`,
    'x-installation-id': phone.installationId,
    'x-app-version': VERSION,
  };
}

function send(phone: Phone, messages: unknown[]): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/listener/messages',
    { messages },
    { ...headersOf(phone), 'content-type': 'application/json' },
  );
}

async function forward(phone: Phone, text: string): Promise<UploadResult> {
  const sent = await send(phone, [sms(text)]);
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const result = (sent.body as { results: UploadResult[] }).results[0];
  if (!result) throw new Error('no result');
  return result;
}

async function quoteTopUp(shop: ShopClient, amount = 500): Promise<Quote> {
  const quoted = await shop.post('/balance/top-up/quote', { amount });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  return quoted.body as Quote;
}

function typeTopUp(
  shop: ShopClient,
  paymentId: string,
  transactionId: string,
  extra: { amountPaid?: number; senderNumber?: string } = {},
): Promise<HttpResult> {
  return shop.post('/balance/top-up/confirm', {
    paymentId,
    transactionId,
    senderNumber: extra.senderNumber ?? SENDER,
    amountPaid: extra.amountPaid ?? 500,
  });
}

async function quotePlan(shop: ShopClient): Promise<Quote> {
  const quoted = await shop.post('/billing/quote', { planId, billingTermId: termId });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  return quoted.body as Quote;
}

function typePlan(shop: ShopClient, paymentId: string, transactionId: string): Promise<HttpResult> {
  return shop.post('/billing/purchase', {
    paymentId,
    method: 'wallet',
    transactionId,
    senderNumber: SENDER,
    amountPaid: 449,
  });
}

async function paymentOf(id: string): Promise<PaymentRow> {
  const { rows } = await admin.query<PaymentRow>(
    `SELECT id, kind, status, amount, verified_by, amount_sent, amount_arrived, review_reason, plan_id
       FROM control.plan_payments WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('no payment');
  return row;
}

async function balanceOf(shop: ShopClient): Promise<number> {
  return Number(((await shop.get('/balance')).body as { amount: string }).amount);
}

async function shopRow(shop: ShopClient): Promise<{ state: string; plan_id: string | null }> {
  const { rows } = await admin.query<{ state: string; plan_id: string | null }>(
    'SELECT state, plan_id FROM control.tenants WHERE id = $1',
    [shop.tenantId],
  );
  const row = rows[0];
  if (!row) throw new Error('no shop');
  return row;
}

async function messageOf(id: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<Record<string, unknown>>(
    `SELECT status, raw_text, amount, review_reason, ignored_reason, plan_payment_id
       FROM control.lytro_listener_messages WHERE transaction_id = $1 ORDER BY created_at`,
    [id],
  );
  return rows;
}

async function feesOf(shop: ShopClient): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'verification_fee'",
    [shop.tenantId],
  );
  return rows[0]?.n ?? 0;
}

async function idUsed(id: string): Promise<boolean> {
  const { rows } = await admin.query(
    'SELECT 1 FROM control.used_transaction_ids WHERE transaction_id = $1',
    [id],
  );
  return rows.length > 0;
}

async function platformLogged(
  action: string,
  targetId: string,
): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<Record<string, unknown>>(
    'SELECT actor_type, actor_id FROM control.platform_audit_log WHERE action = $1 AND target_id = $2',
    [action, targetId],
  );
  return rows;
}

describeIfDatabase("Lytro's own phone (PAY-21)", () => {
  it("pairs with an operator's code, with no shop, and answers with Lytro's bKash numbers", async () => {
    const phone = await lytroPhone();
    expect(phone).toMatchObject({
      shopName: 'Lytro',
      accounts: [{ method: 'bkash', number: '01700000000' }],
      senders: ['bKash'],
    });
    const beat = await sendExact(
      port,
      'POST',
      '/v1/listener/heartbeat',
      undefined,
      headersOf(phone),
    );
    expect(beat.status, JSON.stringify(beat.body)).toBe(200);
    expect(beat.body).toMatchObject({ status: 'connected', shopName: 'Lytro' });
    const listed = await app.get(ListenerDevices).listForLytro();
    expect(listed.devices.map((device) => device.id)).toContain(phone.deviceId);
    expect(listed.limit).toBeNull();
    expect(listed.devices.find((device) => device.id === phone.deviceId)?.online).toBe(true);
    // The operator's routes are the operator's.
    expect((await postJson(port, '/operator/lytro-listener/pairing-codes', {}, {})).status).toBe(
      401,
    );
    expect((await getJson(port, '/operator/lytro-listener/devices', {})).status).toBe(401);
    expect((await getJson(port, '/operator/lytro-listener/receipts', {})).status).toBe(401);
  });

  it("never appears among a shop's phones, is revoked by the operator, and may unpair itself", async () => {
    const shop = await openShop(port, texts, 'lyt');
    const phone = await lytroPhone();
    expect((await shop.get('/listener/devices')).body).toMatchObject({ devices: [], active: 0 });
    await app.get(ListenerDevices).operatorRevoke(phone.deviceId, OPERATOR_ID, null);
    const refused = await send(phone, [sms('Hello')]);
    expect(refused.status).toBe(401);
    const another = await lytroPhone();
    const gone = await sendExact(
      port,
      'POST',
      '/v1/listener/unpair',
      undefined,
      headersOf(another),
    );
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect((await send(another, [sms('Hello')])).status).toBe(401);
  });
});

describeIfDatabase(
  "a seller's payment verifying by itself (PAY-21, BIL-05, BAL-03, WAL-20)",
  () => {
    it('verifies a top-up already typed: the exact amount credited, no fee, the ID used, by the system', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop);
      const id = trx();
      const typed = await typeTopUp(shop, quote.id, id);
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      expect(typed.body).toMatchObject({ status: 'pending' });
      expect(await balanceOf(shop)).toBe(0);

      expect(await forward(phone, receiptText(id, '500.00'))).toMatchObject({ status: 'matched' });
      expect(await balanceOf(shop)).toBe(500);
      expect(await paymentOf(quote.id)).toMatchObject({
        status: 'verified',
        verified_by: null,
        amount_sent: '500.00',
        amount_arrived: '500.00',
      });
      expect(await feesOf(shop)).toBe(0);
      expect(await idUsed(id)).toBe(true);
      expect(await platformLogged('plan_payment_verified', quote.id)).toMatchObject([
        { actor_type: 'system', actor_id: null },
      ]);
      const [row] = await messageOf(id);
      expect(row).toMatchObject({ status: 'matched', plan_payment_id: quote.id });
      expect(row?.['raw_text']).toBe(receiptText(id, '500.00'));
      // Sent again, the same phone adds nothing, and the money is not credited twice.
      expect(await forward(phone, receiptText(id, '500.00'))).toMatchObject({ status: 'matched' });
      expect(await messageOf(id)).toHaveLength(1);
      expect(await balanceOf(shop)).toBe(500);
    });

    it('verifies at once a payment typed after its receipt, ignoring case (VER-04)', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const id = trx();
      expect(await forward(phone, receiptText(id, '500.00'))).toMatchObject({
        status: 'unmatched',
      });
      const quote = await quoteTopUp(shop);
      const typed = await typeTopUp(shop, quote.id, id.toLowerCase());
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      expect(typed.body).toMatchObject({ status: 'verified' });
      expect(await balanceOf(shop)).toBe(500);
    });

    it('activates a plan through the same step as the operator: active, on the plan, its invoice made (BIL-05)', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quotePlan(shop);
      const id = trx();
      const typed = await typePlan(shop, quote.id, id);
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      expect((await shopRow(shop)).state).toBe('trial');
      expect(await forward(phone, receiptText(id, '449.00'))).toMatchObject({ status: 'matched' });
      expect(await shopRow(shop)).toMatchObject({ state: 'active', plan_id: planId });
      const { rows } = await admin.query('SELECT 1 FROM control.invoices WHERE tenant_id = $1', [
        shop.tenantId,
      ]);
      expect(rows).toHaveLength(1);
    });

    // Found untested at the Phase 5 close-out: PLN-14's part in the wallet step (D5-3).
    it('activates an add-on paid in the wallet step, through the same step (PLN-14)', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const plan = await quotePlan(shop);
      const planId0 = trx();
      expect((await typePlan(shop, plan.id, planId0)).status).toBe(201);
      expect(await forward(phone, receiptText(planId0, '449.00'))).toMatchObject({
        status: 'matched',
      });
      expect((await shopRow(shop)).state).toBe('active');

      const addon = await admin.query<{ id: string }>(
        "SELECT id FROM control.addons WHERE key = 'extra_seat'",
      );
      const quoted = await shop.post('/addons/quote', { addonId: addon.rows[0]?.id });
      expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
      const payment = (quoted.body as { payment: { id: string; amount: string } }).payment;
      const id = trx();
      const typed = await shop.post('/addons/purchase', {
        paymentId: payment.id,
        method: 'wallet',
        transactionId: id,
        senderNumber: SENDER,
        amountPaid: Number(payment.amount),
      });
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      type Mine = { addons: { key: string }[] };
      expect(((await shop.get('/addons/mine')).body as Mine).addons).toEqual([]);
      expect(
        await forward(phone, receiptText(id, Number(payment.amount).toFixed(2))),
      ).toMatchObject({
        status: 'matched',
      });
      expect(((await shop.get('/addons/mine')).body as Mine).addons).toEqual([
        expect.objectContaining({ key: 'extra_seat' }),
      ]);
      expect(await paymentOf(payment.id)).toMatchObject({ status: 'verified' });
    });

    it('trusts the receipt over what the seller typed: a typed amount that differs still verifies when the money is right', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop);
      const id = trx();
      const typed = await typeTopUp(shop, quote.id, id, { amountPaid: 450 });
      expect(typed.body).toMatchObject({ status: 'needs_review' });
      expect(await paymentOf(quote.id)).toMatchObject({ amount_sent: '450.00' });
      expect(await forward(phone, receiptText(id, '500.00'))).toMatchObject({ status: 'matched' });
      expect(await balanceOf(shop)).toBe(500);
    });

    it('takes an amount within 0.01 TK', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id);
      expect(await forward(phone, receiptText(id, '499.99'))).toMatchObject({ status: 'matched' });
      expect(await balanceOf(shop)).toBe(499.99);
    });

    it('has no cap: a large top-up verifies by itself (agreed 2026-11-03)', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop, 25_000);
      const id = trx();
      await typeTopUp(shop, quote.id, id, { amountPaid: 25_000 });
      expect(await forward(phone, receiptText(id, '25,000.00'))).toMatchObject({
        status: 'matched',
      });
      expect(await balanceOf(shop)).toBe(25_000);
    });

    it("counts two of Lytro's phones as one verification and one duplicate (VER-03)", async () => {
      const shop = await openShop(port, texts, 'lyt');
      const [first, second] = [await lytroPhone(), await lytroPhone()];
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id);
      expect(await forward(first, receiptText(id, '500.00'))).toMatchObject({ status: 'matched' });
      expect(await forward(second, receiptText(id, '500.00'))).toMatchObject({
        status: 'duplicate',
      });
      const rows = await messageOf(id);
      expect(rows.map((row) => row['status'])).toEqual(['matched', 'duplicate']);
      expect(rows[1]?.['raw_text']).toBeNull();
      expect(await balanceOf(shop)).toBe(500);
    });
  },
);

describeIfDatabase(
  "a seller's payment that goes to the operator (BIL-06, BIL-15, VER-02, VER-04)",
  () => {
    it('holds a top-up at the wrong amount; approving credits what arrived, never what was quoted', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id);
      expect(await forward(phone, receiptText(id, '450.00'))).toMatchObject({
        status: 'needs_review',
        reviewReason: 'amount',
      });
      expect(await balanceOf(shop)).toBe(0);
      const waiting = (await queue.listPending()).find((row) => row.id === quote.id);
      expect(waiting).toMatchObject({
        amountSent: '500.00',
        amountArrived: '450.00',
        reviewReason: 'amount',
        status: 'needs_review',
      });
      await queue.approve(quote.id, OPERATOR_ID, null);
      expect(await balanceOf(shop)).toBe(450);
      expect(await paymentOf(quote.id)).toMatchObject({
        status: 'verified',
        verified_by: OPERATOR_ID,
      });
      // The operator's decision settles the receipt that sent it there.
      expect(await idUsed(id)).toBe(true);
      expect(await messageOf(id)).toMatchObject([
        { status: 'matched', review_reason: null, plan_payment_id: quote.id },
      ]);
    });

    it('lets the operator say what arrived, and never credits what a seller typed on their own say-so', async () => {
      const shop = await openShop(port, texts, 'lyt');
      // No phone saw it: typing 9,000 on a 500 TK quote must not credit 9,000.
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id, { amountPaid: 9000 });
      await queue.approve(quote.id, OPERATOR_ID, null);
      expect(await balanceOf(shop)).toBe(500);
      const other = await quoteTopUp(shop);
      await typeTopUp(shop, other.id, trx(), { amountPaid: 9000 });
      await queue.approve(other.id, OPERATOR_ID, null, '700.00');
      expect(await balanceOf(shop)).toBe(1200);
    });

    it('never activates a plan at the wrong amount; its money may go on the balance instead', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quotePlan(shop);
      const id = trx();
      await typePlan(shop, quote.id, id);
      expect(await forward(phone, receiptText(id, '400.00'))).toMatchObject({
        status: 'needs_review',
        reviewReason: 'amount',
      });
      expect((await shopRow(shop)).state).toBe('trial');
      await queue.creditInstead(quote.id, OPERATOR_ID, null);
      expect(await balanceOf(shop)).toBe(400);
      expect((await shopRow(shop)).state).toBe('trial');
      expect(await paymentOf(quote.id)).toMatchObject({
        kind: 'top_up',
        status: 'verified',
        amount: '400.00',
        plan_id: null,
        verified_by: OPERATOR_ID,
      });
      expect(await idUsed(id)).toBe(true);
      expect(await messageOf(id)).toMatchObject([{ status: 'matched', plan_payment_id: quote.id }]);
      expect(await platformLogged('plan_payment_credited', quote.id)).toHaveLength(1);
      // Done once: it isn't waiting any more, and can't be credited or approved again.
      await expect(queue.creditInstead(quote.id, OPERATOR_ID, null)).rejects.toMatchObject({
        code: 'conflict',
      });
      await expect(queue.approve(quote.id, OPERATOR_ID, null)).rejects.toMatchObject({
        code: 'conflict',
      });
      expect(await balanceOf(shop)).toBe(400);
    });

    it('asks the operator how much when nothing says what arrived, and refuses a top-up (it is already one)', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const quote = await quotePlan(shop);
      await typePlan(shop, quote.id, trx());
      await expect(queue.creditInstead(quote.id, OPERATOR_ID, null)).rejects.toMatchObject({
        code: 'validation_error',
      });
      await queue.creditInstead(quote.id, OPERATOR_ID, null, '449.00');
      expect(await balanceOf(shop)).toBe(449);
      const topUp = await quoteTopUp(shop);
      await typeTopUp(shop, topUp.id, trx());
      await expect(
        queue.creditInstead(topUp.id, OPERATOR_ID, null, '500.00'),
      ).rejects.toMatchObject({
        code: 'conflict',
      });
    });

    it('sends another sender, or a receipt from before the quote, to the operator', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const wrong = await quoteTopUp(shop);
      const wrongId = trx();
      await typeTopUp(shop, wrong.id, wrongId, { senderNumber: '01911000009' });
      expect(await forward(phone, receiptText(wrongId, '500.00'))).toMatchObject({
        status: 'needs_review',
        reviewReason: 'sender',
      });
      expect(await balanceOf(shop)).toBe(0);
      const oldId = trx();
      await send(phone, [
        sms(receiptText(oldId, '500.00'), { receivedAt: new Date(Date.now() - 3 * 60 * MINUTE) }),
      ]);
      const quote = await quoteTopUp(shop);
      const typed = await typeTopUp(shop, quote.id, oldId);
      expect(typed.body).toMatchObject({ status: 'needs_review' });
      expect(await paymentOf(quote.id)).toMatchObject({ review_reason: 'old_receipt' });
      expect(await balanceOf(shop)).toBe(0);
      // A receipt a minute before the quote, the seller paying first, still verifies.
      const justBefore = trx();
      await send(phone, [
        sms(receiptText(justBefore, '500.00'), { receivedAt: new Date(Date.now() - MINUTE) }),
      ]);
      const quick = await quoteTopUp(shop);
      expect((await typeTopUp(shop, quick.id, justBefore)).body).toMatchObject({
        status: 'verified',
      });
    });

    it('leaves a receipt unclaimed again when the operator turns its payment down', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id);
      await forward(phone, receiptText(id, '450.00'));
      await queue.reject(quote.id, OPERATOR_ID, 'Wrong amount');
      // Turned down, it is closed: its money can't go on the balance either.
      await expect(
        queue.creditInstead(quote.id, OPERATOR_ID, null, '450.00'),
      ).rejects.toMatchObject({
        code: 'conflict',
      });
      expect(await messageOf(id)).toMatchObject([
        { status: 'unmatched', review_reason: null, plan_payment_id: null },
      ]);
      expect(await balanceOf(shop)).toBe(0);
    });

    it('activates nothing for money that arrives once a request is closed (BIL-15)', async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quotePlan(shop);
      const id = trx();
      await typePlan(shop, quote.id, id);
      await queue.reject(quote.id, OPERATOR_ID, 'No payment arrived');
      // Turned down, its money can't go on the balance either.
      await expect(
        queue.creditInstead(quote.id, OPERATOR_ID, null, '449.00'),
      ).rejects.toMatchObject({
        code: 'conflict',
      });
      // A rejected payment lets go of its ID, so this receipt finds the closed request.
      expect(await forward(phone, receiptText(id, '449.00'))).toMatchObject({
        status: 'needs_review',
        reviewReason: 'request_closed',
      });
      expect((await shopRow(shop)).state).toBe('trial');
      expect(await paymentOf(quote.id)).toMatchObject({ status: 'rejected' });
      expect(await idUsed(id)).toBe(false);
      // Typed again on a new request, that receipt is the operator's to sort out, not a verification.
      const again = await quotePlan(shop);
      const retyped = await typePlan(shop, again.id, id);
      expect(retyped.body).toMatchObject({ status: 'needs_review' });
      expect(await paymentOf(again.id)).toMatchObject({ review_reason: 'transaction_id_used' });
      expect((await shopRow(shop)).state).toBe('trial');
    });

    it("refuses an ID another shop's payment already holds, for the operator", async () => {
      const shop = await openShop(port, texts, 'lyt');
      const phone = await lytroPhone();
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id);
      await admin.query(
        'INSERT INTO control.used_transaction_ids (transaction_id, tenant_id) VALUES ($1, $2)',
        [id, randomUUID()],
      );
      expect(await forward(phone, receiptText(id, '500.00'))).toMatchObject({
        status: 'needs_review',
        reviewReason: 'transaction_id_used',
      });
      expect(await balanceOf(shop)).toBe(0);
    });

    it("keeps a shop's phone and Lytro's apart: neither verifies the other's payment (VER-05)", async () => {
      const shop = await openShop(port, texts, 'lyt');
      // A shop's own phone forwarding a seller's receipt leaves the payment to Lytro waiting.
      const made = await postJson(port, '/listener/pairing-codes', {}, shop.headers());
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const installationId = `install-${randomUUID()}`;
      const paired = await sendExact(
        port,
        'POST',
        '/v1/listener/pair',
        { code: (made.body as { code: string }).code, installationId, model: 'Redmi 12' },
        {
          host: 'api.localhost',
          'content-type': 'application/json',
          'x-test-visitor': '198.51.100.77',
          'x-app-version': VERSION,
        },
      );
      expect(paired.status, JSON.stringify(paired.body)).toBe(201);
      const shopPhone = { ...(paired.body as Omit<Phone, 'installationId'>), installationId };
      const quote = await quoteTopUp(shop);
      const id = trx();
      await typeTopUp(shop, quote.id, id);
      expect(await forward(shopPhone, receiptText(id, '500.00'))).toMatchObject({
        status: 'unmatched',
      });
      expect(await balanceOf(shop)).toBe(0);
      expect(await messageOf(id)).toEqual([]);
      const lytroPhones = await app.get(ListenerDevices).listForLytro();
      expect(lytroPhones.devices.map((row) => row.id)).not.toContain(shopPhone.deviceId);
      // Lytro's phone then verifies it, in its own table.
      const lytro = await lytroPhone();
      expect(await forward(lytro, receiptText(id, '500.00'))).toMatchObject({ status: 'matched' });
      expect(await balanceOf(shop)).toBe(500);
    });
  },
);

describeIfDatabase("what else Lytro's phone keeps (VER-06, LSN-04, LSN-17)", () => {
  it('keeps no text of what is no receipt, in its own table; test mode reads and verifies nothing', async () => {
    const shop = await openShop(port, texts, 'lyt');
    const phone = await lytroPhone();
    const quote = await quoteTopUp(shop);
    const id = trx();
    await typeTopUp(shop, quote.id, id);
    const sent = await send(phone, [
      sms('Your bKash verification code is 482910.'),
      sms(receiptText(id, '500.00'), { sender: 'Stranger' }),
    ]);
    expect(
      (sent.body as { results: UploadResult[] }).results.map((row) => row.ignoredReason),
    ).toEqual(['not_receipt', 'unknown_sender']);
    const started = await sendExact(
      port,
      'POST',
      '/v1/listener/test-mode',
      undefined,
      headersOf(phone),
    );
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const tested = await send(phone, [sms(receiptText(id, '500.00'), { sender: 'Stranger' })]);
    expect((tested.body as { results: UploadResult[] }).results[0]).toMatchObject({
      status: 'ignored',
      ignoredReason: 'test_mode',
    });
    expect(await messageOf(id)).toMatchObject([
      { status: 'ignored', ignored_reason: 'test_mode', raw_text: null, amount: '500.00' },
    ]);
    expect(await balanceOf(shop)).toBe(0);
    // Another of Lytro's phones has its own list.
    await forward(await lytroPhone(), receiptText(trx(), '5.00'));
    const recent = await sendExact(
      port,
      'GET',
      '/v1/listener/messages',
      undefined,
      headersOf(phone),
    );
    expect(recent.status, JSON.stringify(recent.body)).toBe(200);
    expect((recent.body as { receipts: unknown[] }).receipts).toMatchObject([
      { ignoredReason: 'test_mode', orderNumber: null },
    ]);
    expect(JSON.stringify(recent.body)).not.toContain('You have received');
    const { rows } = await admin.query(
      `SELECT 1 FROM control.lytro_listener_messages WHERE device_id = $1 AND raw_text IS NOT NULL`,
      [phone.deviceId],
    );
    expect(rows).toEqual([]);
  });

  it('shows the phone its counts, and the operator the unclaimed money, searchable', async () => {
    const phone = await lytroPhone();
    const id = trx();
    await forward(phone, receiptText(id, '777.00', '01911000123'));
    // Another of Lytro's phones counts for itself.
    await forward(await lytroPhone(), receiptText(trx(), '5.00'));
    const read = await sendExact(port, 'GET', '/v1/listener/messages', undefined, headersOf(phone));
    expect(read.body).toMatchObject({ today: { verified: 0, waiting: 1, toCheck: 0 } });
    const lytro = app.get(LytroReceipts);
    for (const q of [id.slice(0, 6).toLowerCase(), '01911000123']) {
      const found = await lytro.list({ q, page: 1, limit: 20 });
      expect(found, q).toMatchObject({
        total: 1,
        receipts: [{ transactionId: id, amount: '777.00', senderNumber: '01911000123' }],
      });
    }
    const held = await lytro.list({ status: 'unmatched' as never, page: 1, limit: 50 });
    expect(held.receipts.map((row) => row.transactionId)).toContain(id);
    const none = await lytro.list({ q: 'NOSUCHTHING', page: 1, limit: 20 });
    expect(none.total).toBe(0);
  });

  it('redacts text past 90 days, keeping the rest, and removes what verifies nothing (LSN-17)', async () => {
    const phone = await lytroPhone();
    const oldId = trx();
    const newId = trx();
    await forward(phone, receiptText(oldId, '10.00'));
    await forward(phone, receiptText(newId, '20.00'));
    await send(phone, [sms('Hello', { sender: 'Stranger' })]);
    await admin.query(
      `UPDATE control.lytro_listener_messages SET received_at = now() - interval '91 days'
        WHERE device_id = $1 AND (transaction_id = $2 OR status = 'ignored')`,
      [phone.deviceId, oldId],
    );
    await app.get(ListenerReceipts).redactOld(new Date());
    expect(await messageOf(oldId)).toMatchObject([
      { raw_text: null, status: 'unmatched', amount: '10.00' },
    ]);
    expect((await messageOf(newId))[0]?.['raw_text']).toBe(receiptText(newId, '20.00'));
    const { rows } = await admin.query(
      "SELECT 1 FROM control.lytro_listener_messages WHERE device_id = $1 AND status = 'ignored'",
      [phone.deviceId],
    );
    expect(rows).toEqual([]);
  });
});
