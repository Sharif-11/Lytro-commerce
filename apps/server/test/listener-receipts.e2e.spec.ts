import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlatformSettingKey, RateKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import { RateService } from '../src/modules/balance/services/rate.service';
import { LOW_BALANCE_NOTIFIER } from '../src/modules/balance/tokens';
import type {
  ListenerUnreadNotice,
  ListenerVolumeNotice,
} from '../src/modules/listener/ports/listener-notifier';
import { ListenerDevices } from '../src/modules/listener/services/listener-devices';
import { ListenerLimits } from '../src/modules/listener/services/listener-limits';
import { LISTENER_CLOCK, LISTENER_NOTIFIER } from '../src/modules/listener/tokens';
import { ListenerReceipts } from '../src/modules/listener-receipts/services/listener-receipts';
import type {
  MoneyForClosedOrderNotice,
  PaymentToVerifyNotice,
  PaymentVerifiedNotice,
} from '../src/modules/payment-sessions/ports/payment-notifier';
import { PaymentSessionExpiry } from '../src/modules/payment-sessions/services/payment-session-expiry';
import { PAYMENT_NOTIFIER } from '../src/modules/payment-sessions/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { LowBalanceCapture } from './support/low-balance-capture';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { payPage, screenOf } from './support/pay-page';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.4b, read agreed 2026-11-02: what listener phones forward. A receipt verifies the payment that typed its
// transaction ID, whichever came first, with the listener's fee -- free on a trial -- or goes to staff with its reason
// (VER-02 to VER-05, WAL-20, WAL-21, D5-4); what is no receipt keeps no text (VER-06, LSN-15, LSN-16); uploads are limited
// and a flood flagged (LSN-13, LSN-14); test mode, redaction and the app's own reads (LSN-04, LSN-17, LSN-20); staff hear
// when a phone cannot help (VER-01, VER-07); a shopper may correct a typed ID (PAY-07). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_listener_receipts_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBSITE = 'https://myshop.com';
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
const PAYMENT = { method: 'bkash', returnUrl: `${WEBSITE}/thanks` };
const VERSION = '1.0.0';
const SENDER_NUMBER = '01811000002';
const MINUTE = 60_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const texts = new SmsCapture();
const lowBalance = new LowBalanceCapture();
const toVerify: PaymentToVerifyNotice[] = [];
const verified: PaymentVerifiedNotice[] = [];
const closed: MoneyForClosedOrderNotice[] = [];
const volume: ListenerVolumeNotice[] = [];
const unread: ListenerUnreadNotice[] = [];

/** Lets a test play several visitors: the address is the `x-test-visitor` header's, else the socket's. */
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
  process.env['OTP_SECRET'] = 'listener-receipts-e2e-otp-secret-012345678';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(LOW_BALANCE_NOTIFIER)
    .useValue(lowBalance)
    .overrideProvider(LISTENER_CLOCK)
    .useValue(() => new Date(Date.now() + clockShift))
    .overrideProvider(PAYMENT_NOTIFIER)
    .useValue({
      paymentToVerify: (notice: PaymentToVerifyNotice) => {
        toVerify.push(notice);
        return Promise.resolve();
      },
      paymentVerified: (notice: PaymentVerifiedNotice) => {
        verified.push(notice);
        return Promise.resolve();
      },
      moneyForClosedOrder: (notice: MoneyForClosedOrderNotice) => {
        closed.push(notice);
        return Promise.resolve();
      },
    })
    .overrideProvider(LISTENER_NOTIFIER)
    .useValue({
      deviceAutoRevoked: () => Promise.resolve(),
      volumeFlagged: (notice: ListenerVolumeNotice) => {
        volume.push(notice);
        return Promise.resolve();
      },
      unreadMessages: (notice: ListenerUnreadNotice) => {
        unread.push(notice);
        return Promise.resolve();
      },
    })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  clockShift = 0;
});

interface Setup {
  shop: ShopClient;
  key: string;
  variantId: string;
  locationId: number;
}

interface Phone {
  deviceId: string;
  token: string;
  installationId: string;
  accounts: { method: string; number: string }[];
  senders: string[];
  testModeUntil: string | null;
}

interface UploadBody {
  results: {
    status: string | null;
    transactionId: string | null;
    reviewReason: string | null;
    ignoredReason: string | null;
  }[];
  testModeUntil: string | null;
}

interface PageBody {
  state: string;
  review: { reason: string } | null;
  listenerOnline: boolean;
  idChangesLeft: number;
  submitted: { transactionId: string; senderNumber: string | null } | null;
}

interface MessageRow {
  status: string;
  raw_text: string | null;
  transaction_id: string | null;
  amount: string | null;
  ignored_reason: string | null;
  review_reason: string | null;
  session_id: string | null;
  payment_id: string | null;
}

function trx(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

/** bKash's receipt for money reaching the account. */
function receiptText(id: string, amount = '300.00', from = SENDER_NUMBER): string {
  return `You have received Tk ${amount} from ${from}. Fee Tk 0.00. Balance Tk 1,500.00. TrxID ${id} at 02/11/2026 13:58`;
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

/** A shop with a bKash account shoppers pay into, a key for its website, and a product needing a 300 TK advance. */
async function payingShop(advance = 300): Promise<Setup> {
  const shop = await openShop(port, texts, 'rcp');
  const saved = await shop.put('/payment-methods/bkash', {
    enabled: true,
    accounts: [
      { accountName: 'Rahim Store', number: '01711000001', accountType: 'personal', active: true },
    ],
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const made = await shop.post('/products', {
    name: 'Saree',
    basePrice: 1000,
    paymentPolicy: 'partial_advance',
    advanceAmount: advance,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = await shop.post('/api-keys', { name: 'Website', websites: [WEBSITE] });
  const locations = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  return {
    shop,
    key: (key.body as { key: string }).key,
    variantId: (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    locationId:
      locations.zillas
        .find((row) => row.nameEn === 'Dhaka')
        ?.thanas.find((row) => row.nameEn === 'Mirpur')?.id ?? 0,
  };
}

/** A shop past its trial with a balance: active, room for phones and staff, and paying the fee. */
async function paidShop(balance = '100.00', advance = 300): Promise<Setup> {
  const setup = await payingShop(advance);
  await admin.query(
    `UPDATE control.tenants SET state = 'active',
       plan_snapshot = coalesce(plan_snapshot, '{}'::jsonb) || '{"paired_devices": 5, "staff": 10}'::jsonb
     WHERE id = $1`,
    [setup.shop.tenantId],
  );
  await seedBalance(admin, setup.shop.tenantId, balance);
  return setup;
}

async function phoneOf(shop: ShopClient): Promise<Phone> {
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
      'x-test-visitor': `198.51.100.${String(Math.floor(Math.random() * 250))}`,
      'x-app-version': VERSION,
    },
  );
  expect(paired.status, JSON.stringify(paired.body)).toBe(201);
  const phone = { ...(paired.body as Omit<Phone, 'installationId'>), installationId };
  // The app reports as soon as it is paired, which puts the phone online (LSN-03).
  const reported = await beat(phone);
  expect(reported.status, JSON.stringify(reported.body)).toBe(200);
  return phone;
}

function phoneHeaders(phone: Phone): Record<string, string> {
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
    { ...phoneHeaders(phone), 'content-type': 'application/json' },
  );
}

async function forward(phone: Phone, text: string): Promise<UploadBody['results'][number]> {
  const sent = await send(phone, [sms(text)]);
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const [result] = (sent.body as UploadBody).results;
  if (!result) throw new Error('no result');
  return result;
}

function beat(phone: Phone): Promise<HttpResult> {
  return sendExact(port, 'POST', '/v1/listener/heartbeat', undefined, phoneHeaders(phone));
}

/** A shopper's order through the website's key: the reference of its payment page. */
async function placed(setup: Setup, phone = texts.freshPhone()): Promise<string> {
  const made = await sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima',
      phone,
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      payment: PAYMENT,
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${setup.key}`,
      origin: WEBSITE,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'x-test-visitor': `203.0.113.${String(Math.floor(Math.random() * 250))}`,
    },
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const url = (made.body as { payment: { paymentUrl: string } }).payment.paymentUrl;
  const ref = PAGE_URL.exec(url)?.[1];
  if (!ref) throw new Error(`no payment page in ${url}`);
  return ref;
}

function pageOf(ref: string): Promise<HttpResult> {
  return sendExact(port, 'GET', `/v1/pay/${ref}`, undefined, { host: 'api.localhost' });
}

async function pageBody(ref: string): Promise<PageBody> {
  const read = await pageOf(ref);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as PageBody;
}

function typeId(
  ref: string,
  transactionId: string,
  extra: Record<string, unknown> = {},
): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    `/v1/pay/${ref}/transaction`,
    { method: 'bkash', transactionId, ...extra },
    { host: 'api.localhost', 'content-type': 'application/json' },
  );
}

function correctId(ref: string, transactionId: string): Promise<HttpResult> {
  return sendExact(
    port,
    'PATCH',
    `/v1/pay/${ref}/transaction`,
    { transactionId },
    { host: 'api.localhost', 'content-type': 'application/json' },
  );
}

async function sessionOf(
  ref: string,
): Promise<{ id: string; order_id: string; state: string; staff_told_at: Date | null }> {
  const { rows } = await admin.query<{
    id: string;
    order_id: string;
    state: string;
    staff_told_at: Date | null;
  }>('SELECT id, order_id, state, staff_told_at FROM tenant.payment_sessions WHERE ref = $1', [
    ref,
  ]);
  const row = rows[0];
  if (!row) throw new Error('no session');
  return row;
}

async function orderOf(shop: ShopClient, ref: string): Promise<Record<string, unknown>> {
  const session = await sessionOf(ref);
  return (await shop.get(`/orders/${session.order_id}`)).body as Record<string, unknown>;
}

async function paymentsOfOrder(orderId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<Record<string, unknown>>(
    'SELECT amount, verification_level, verified_by, transaction_id, session_id FROM tenant.payments WHERE order_id = $1',
    [orderId],
  );
  return rows;
}

async function messageOf(tenantId: string, id: string): Promise<MessageRow[]> {
  const { rows } = await admin.query<MessageRow>(
    `SELECT status, raw_text, transaction_id, amount, ignored_reason, review_reason, session_id, payment_id
       FROM tenant.listener_messages WHERE tenant_id = $1 AND transaction_id = $2 ORDER BY created_at`,
    [tenantId, id],
  );
  return rows;
}

async function allMessages(tenantId: string): Promise<MessageRow[]> {
  const { rows } = await admin.query<MessageRow>(
    `SELECT status, raw_text, transaction_id, amount, ignored_reason, review_reason, session_id, payment_id
       FROM tenant.listener_messages WHERE tenant_id = $1 ORDER BY created_at`,
    [tenantId],
  );
  return rows;
}

async function feesOf(tenantId: string): Promise<{ amount: string; reference: unknown }[]> {
  const { rows } = await admin.query<{ amount: string; reference: unknown }>(
    "SELECT amount, reference FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'verification_fee' ORDER BY created_at",
    [tenantId],
  );
  return rows;
}

async function logged(tenantId: string, action: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<{ summary: Record<string, unknown> }>(
    'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY created_at',
    [tenantId, action],
  );
  return rows.map((row) => row.summary);
}

function noticesFor<T extends { tenantId: string | null }>(notices: T[], shop: ShopClient): T[] {
  return notices.filter((notice) => notice.tenantId === shop.tenantId);
}

describeIfDatabase('a receipt verifying its payment (VER-02 to VER-04, VER-12, WAL-20)', () => {
  it('verifies a payment already typed, when the phone forwards its receipt: paid, by the listener, fee charged', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    const typed = await typeId(ref, id, { senderNumber: SENDER_NUMBER });
    expect(typed.status, JSON.stringify(typed.body)).toBe(201);
    // A phone is online, so the page waits on it and staff are not told yet (VER-07).
    expect(typed.body).toMatchObject({ state: 'checking', listenerOnline: true, review: null });
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(0);

    const result = await forward(phone, receiptText(id));
    expect(result).toMatchObject({ status: 'matched', transactionId: id, reviewReason: null });
    expect(await pageBody(ref)).toMatchObject({ state: 'verified', idChangesLeft: 0 });
    const session = await sessionOf(ref);
    const order = await orderOf(setup.shop, ref);
    expect(order).toMatchObject({ status: 'pending', paymentStatus: 'paid' });
    expect(await paymentsOfOrder(session.order_id)).toMatchObject([
      {
        amount: '300.00',
        verification_level: 'listener',
        verified_by: null,
        transaction_id: id,
        session_id: session.id,
      },
    ]);
    // WAL-20: 0.10% of 300 TK, once, on its own entry naming the method.
    const fees = await feesOf(setup.shop.tenantId);
    expect(fees).toHaveLength(1);
    expect(Number(fees[0]?.amount)).toBe(-0.3);
    expect(fees[0]?.reference).toMatchObject({
      method: 'listener',
      sessionId: session.id,
      amount: '300.00',
    });
    // The receipt keeps its text and names what it became; staff are told, and it is audited.
    const [row] = await messageOf(setup.shop.tenantId, id);
    expect(row).toMatchObject({ status: 'matched', session_id: session.id });
    expect(row?.raw_text).toBe(receiptText(id));
    expect(row?.payment_id).toBeTruthy();
    expect(noticesFor(verified, setup.shop)).toMatchObject([{ transactionId: id }]);
    expect(await logged(setup.shop.tenantId, 'payment_verified')).toHaveLength(1);
    // The ID is the payment's now: nobody may type it again.
    const again = await typeId(await placed(setup), id);
    expect(again.status).toBe(409);
  });

  it('verifies at once a payment typed after its receipt, ignoring case, in the typing itself (VER-04)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const id = trx();
    expect(await forward(phone, receiptText(id))).toMatchObject({ status: 'unmatched' });
    const ref = await placed(setup);
    const typed = await typeId(ref, id.toLowerCase());
    expect(typed.status, JSON.stringify(typed.body)).toBe(201);
    expect(typed.body).toMatchObject({ state: 'verified' });
    expect(await orderOf(setup.shop, ref)).toMatchObject({ paymentStatus: 'paid' });
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(0);
  });

  it('counts two phones as one verification and one duplicate; a phone sending again adds nothing (VER-03)', async () => {
    const setup = await paidShop();
    const [first, second] = [await phoneOf(setup.shop), await phoneOf(setup.shop)];
    const ref = await placed(setup);
    const id = trx();
    expect((await typeId(ref, id)).status).toBe(201);
    expect(await forward(first, receiptText(id))).toMatchObject({ status: 'matched' });
    expect(await forward(second, receiptText(id))).toMatchObject({ status: 'duplicate' });
    // Each phone sending its own again is told how it stands, and adds no row.
    expect(await forward(first, receiptText(id))).toMatchObject({ status: 'matched' });
    expect(await forward(second, receiptText(id))).toMatchObject({ status: 'duplicate' });
    const rows = await messageOf(setup.shop.tenantId, id);
    expect(rows.map((row) => row.status)).toEqual(['matched', 'duplicate']);
    expect(rows[1]?.raw_text).toBeNull();
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);
    expect(await paymentsOfOrder((await sessionOf(ref)).order_id)).toHaveLength(1);
  });

  it('takes an amount within 0.01 TK, and a receipt that masks its sender', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const near = await placed(setup);
    const id = trx();
    await typeId(near, id, { senderNumber: SENDER_NUMBER });
    expect(await forward(phone, receiptText(id, '299.99'))).toMatchObject({ status: 'matched' });
    const masked = await placed(setup);
    const other = trx();
    await typeId(masked, other, { senderNumber: SENDER_NUMBER });
    expect(await forward(phone, receiptText(other, '300.00', '018XXXXXX02'))).toMatchObject({
      status: 'matched',
    });
  });

  it("uses the listener's rate as it stands, never going back, and charges nothing that rounds to nothing (RAT-16, BAL-16)", async () => {
    const rates = app.get(RateService);
    const setup = await paidShop('100.00', 4);
    const phone = await phoneOf(setup.shop);
    const tiny = await placed(setup);
    const first = trx();
    await typeId(tiny, first);
    expect(await forward(phone, receiptText(first, '4.00'))).toMatchObject({ status: 'matched' });
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(0);
    await rates.change(RateKey.ListenerVerificationPct, '50.00', randomUUID(), null);
    try {
      const dear = await placed(setup);
      const second = trx();
      await typeId(dear, second);
      expect(await forward(phone, receiptText(second, '4.00'))).toMatchObject({
        status: 'matched',
      });
      const fees = await feesOf(setup.shop.tenantId);
      expect(fees.map((row) => Number(row.amount))).toEqual([-2]);
    } finally {
      await rates.change(RateKey.ListenerVerificationPct, '0.10', randomUUID(), null);
    }
  });

  it('charges a trial shop nothing, so a new shop sees the listener work with no balance (WAL-20, agreed 2026-11-02)', async () => {
    const setup = await payingShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    expect(await forward(phone, receiptText(id))).toMatchObject({ status: 'matched' });
    expect(await pageBody(ref)).toMatchObject({ state: 'verified' });
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(0);
    expect(lowBalance.feeShort.filter((row) => row.tenantId === setup.shop.tenantId)).toEqual([]);
  });

  it('keeps a receipt nobody typed, unclaimed, with no notice (VER-04, agreed 2026-11-02)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const id = trx();
    expect(await forward(phone, receiptText(id))).toMatchObject({ status: 'unmatched' });
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(0);
    expect(noticesFor(closed, setup.shop)).toHaveLength(0);
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(0);
  });

  it("tells Meta of a checkout's purchase when the listener verifies it (Slice 5.3's rule)", async () => {
    const setup = await paidShop();
    const tracking = await setup.shop.put('/ad-tracking', {
      metaPixelId: '1234567890',
      conversionsApiToken: 'EAAB-test-token-value',
    });
    expect(tracking.status, JSON.stringify(tracking.body)).toBe(200);
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    const queued = async (): Promise<string[]> => {
      const { rows } = await admin.query<{ payload: { orderId: string } }>(
        `SELECT payload FROM control.job_outbox WHERE queue_name = 'meta_purchase' AND payload->>'tenantId' = $1`,
        [setup.shop.tenantId],
      );
      return rows.map((row) => row.payload.orderId);
    };
    expect(await queued()).toEqual([]);
    await forward(phone, receiptText(id));
    expect(await queued()).toEqual([(await sessionOf(ref)).order_id]);
  });

  it("never lets a shop's phone verify another shop's payment (VER-05)", async () => {
    const victim = await paidShop();
    const other = await paidShop();
    const phone = await phoneOf(other.shop);
    const ref = await placed(victim);
    const id = trx();
    await typeId(ref, id);
    expect(await forward(phone, receiptText(id))).toMatchObject({ status: 'unmatched' });
    expect(await pageBody(ref)).toMatchObject({ state: 'checking' });
    expect(await messageOf(victim.shop.tenantId, id)).toEqual([]);
    expect(await feesOf(victim.shop.tenantId)).toEqual([]);
  });
});

describeIfDatabase('a receipt that goes to staff (VER-02, VER-04, WAL-21, D5-4, PAY-14)', () => {
  it('sends another amount to staff at once, telling them what arrived; verified by hand there is no fee', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    expect(await forward(phone, receiptText(id, '250.00'))).toMatchObject({
      status: 'needs_review',
      reviewReason: 'amount',
    });
    expect(await pageBody(ref)).toMatchObject({
      state: 'needs_review',
      review: { reason: 'amount' },
    });
    expect(noticesFor(toVerify, setup.shop)).toMatchObject([{ transactionId: id }]);
    expect(noticesFor(verified, setup.shop)).toEqual([]);
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    const session = await sessionOf(ref);
    const listed = await setup.shop.get('/payments?status=to_verify');
    expect(listed.body).toMatchObject({
      payments: [
        {
          id: session.id,
          reviewReason: 'amount',
          receipt: { amount: '250.00', senderNumber: SENDER_NUMBER },
        },
      ],
    });
    // Staff verify what arrived: by hand, free (WAL-20), and the receipt is used.
    const done = await postJson(
      port,
      `/payments/${session.id}/verify`,
      { amount: 250 },
      setup.shop.headers(),
    );
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    const [row] = await messageOf(setup.shop.tenantId, id);
    expect(row).toMatchObject({ status: 'matched', review_reason: null });
    expect(await paymentsOfOrder(session.order_id)).toMatchObject([
      { verification_level: 'manual' },
    ]);
  });

  it('sends another sender than the shopper gave to staff (VER-02)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id, { senderNumber: '01911000009' });
    expect(await forward(phone, receiptText(id))).toMatchObject({
      status: 'needs_review',
      reviewReason: 'sender',
    });
    expect(await pageBody(ref)).toMatchObject({ review: { reason: 'sender' } });
  });

  it('sends a receipt from before the page opened to staff, whichever came first (VER-04, agreed 2026-11-02)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const id = trx();
    const hoursAgo = new Date(Date.now() - 3 * 60 * MINUTE);
    const sent = await send(phone, [sms(receiptText(id), { receivedAt: hoursAgo })]);
    expect((sent.body as UploadBody).results[0]).toMatchObject({ status: 'unmatched' });
    const ref = await placed(setup);
    const typed = await typeId(ref, id);
    expect(typed.status, JSON.stringify(typed.body)).toBe(201);
    expect(typed.body).toMatchObject({ state: 'needs_review', review: { reason: 'other' } });
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    expect(await messageOf(setup.shop.tenantId, id)).toMatchObject([
      { status: 'needs_review', review_reason: 'old_receipt' },
    ]);
    // A receipt a minute before the page, the shopper paying as it loads, still verifies.
    const justBefore = trx();
    await send(phone, [
      sms(receiptText(justBefore), { receivedAt: new Date(Date.now() - MINUTE) }),
    ]);
    const quick = await typeId(await placed(setup), justBefore);
    expect(quick.body).toMatchObject({ state: 'verified' });
  });

  it("sends a match the balance can't pay for to staff, free, telling the shop once a day; the shopper never hears why (WAL-21)", async () => {
    const setup = await paidShop('0');
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    expect(await forward(phone, receiptText(id))).toMatchObject({
      status: 'needs_review',
      reviewReason: 'low_balance',
    });
    const page = await pageOf(ref);
    expect(page.body).toMatchObject({ state: 'needs_review', review: { reason: 'other' } });
    expect(JSON.stringify(page.body)).not.toContain('balance');
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    const second = await placed(setup);
    const otherId = trx();
    await typeId(second, otherId);
    await forward(phone, receiptText(otherId));
    expect(lowBalance.feeShort.filter((row) => row.tenantId === setup.shop.tenantId)).toHaveLength(
      1,
    );
    // Staff verify it by hand, for free.
    const session = await sessionOf(ref);
    const done = await postJson(port, `/payments/${session.id}/verify`, {}, setup.shop.headers());
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
  });

  it("sends another wallet's money to staff (VER-02)", async () => {
    const setup = await paidShop();
    const saved = await setup.shop.put('/payment-methods/nagad', {
      enabled: true,
      accounts: [
        { accountName: 'Rahim', number: '01711000005', accountType: 'personal', active: true },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    const typed = await typeId(ref, id, { method: 'nagad' });
    // LSN-06: no phone can read Nagad's yet, so staff are told at once.
    expect(typed.body).toMatchObject({ state: 'checking', listenerOnline: false });
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(1);
    expect(await forward(phone, receiptText(id))).toMatchObject({
      status: 'needs_review',
      reviewReason: 'wallet',
    });
  });

  it('never reopens an order for money that turns up after staff rejected it (D5-4)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    const session = await sessionOf(ref);
    const rejected = await postJson(
      port,
      `/payments/${session.id}/reject`,
      { reason: 'no_payment_found' },
      setup.shop.headers(),
    );
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(await forward(phone, receiptText(id))).toMatchObject({
      status: 'needs_review',
      reviewReason: 'order_closed',
    });
    expect(await orderOf(setup.shop, ref)).toMatchObject({ status: 'cancelled' });
    expect(await pageBody(ref)).toMatchObject({ state: 'failed' });
    expect(noticesFor(closed, setup.shop)).toMatchObject([{ transactionId: id }]);
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
  });

  it('leaves a receipt unclaimed again when staff reject the payment it claimed', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    await forward(phone, receiptText(id, '250.00'));
    const session = await sessionOf(ref);
    await postJson(
      port,
      `/payments/${session.id}/reject`,
      { reason: 'no_payment_found' },
      setup.shop.headers(),
    );
    expect(await messageOf(setup.shop.tenantId, id)).toMatchObject([
      { status: 'unmatched', review_reason: null, session_id: null },
    ]);
  });

  it('marks a receipt used when staff record its ID by hand, either way round, and frees it when they void (agreed 2026-11-02)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    // Staff first: the receipt finds the payment, and no fee is charged.
    const recordedFirst = await placed(setup);
    const firstId = trx();
    const firstOrder = (await sessionOf(recordedFirst)).order_id;
    const recorded = await postJson(
      port,
      `/orders/${firstOrder}/payments`,
      { method: 'bkash', amount: 300, transactionId: firstId, senderNumber: SENDER_NUMBER },
      setup.shop.headers(),
    );
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    expect(await forward(phone, receiptText(firstId))).toMatchObject({ status: 'matched' });
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);

    // The receipt first: recording its ID uses it.
    const receiptFirst = await placed(setup);
    const secondId = trx();
    await forward(phone, receiptText(secondId));
    const secondOrder = (await sessionOf(receiptFirst)).order_id;
    const made = await postJson(
      port,
      `/orders/${secondOrder}/payments`,
      { method: 'bkash', amount: 300, transactionId: secondId, senderNumber: SENDER_NUMBER },
      setup.shop.headers(),
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const [used] = await messageOf(setup.shop.tenantId, secondId);
    expect(used?.status).toBe('matched');
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);

    // Voided, the receipt is unclaimed again.
    const payments = (made.body as { payments: { id: string; transactionId: string }[] }).payments;
    const paymentId = payments.find((row) => row.transactionId === secondId)?.id ?? '';
    const voided = await postJson(
      port,
      `/orders/${secondOrder}/payments/${paymentId}/void`,
      { reason: 'Recorded by mistake' },
      setup.shop.headers(),
    );
    expect(voided.status, JSON.stringify(voided.body)).toBeLessThan(300);
    expect(await messageOf(setup.shop.tenantId, secondId)).toMatchObject([
      { status: 'unmatched', payment_id: null },
    ]);
  });
});

describeIfDatabase('what is no receipt keeps no text (VER-06, LSN-15, LSN-16)', () => {
  it("keeps nothing of a personal SMS, a code, or the shop's own payment, and none verifies anything", async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    const sent = await send(phone, [
      sms('Amma, I reached home safely. 01811000002', { sender: '01811000002' }),
      sms(receiptText(id), { sender: 'FakeBkash' }),
      sms('Your bKash verification code is 482910.'),
      sms(
        `Send Money Tk 300.00 to 01811000002 successful. Fee Tk 5.00. Balance Tk 100.00. TrxID ${id} at 02/11/2026 15:00`,
      ),
    ]);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect((sent.body as UploadBody).results.map((row) => row.ignoredReason)).toEqual([
      'unknown_sender',
      'unknown_sender',
      'not_receipt',
      'not_money_in',
    ]);
    const rows = await allMessages(setup.shop.tenantId);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'ignored', raw_text: null, transaction_id: null });
    }
    expect(await pageBody(ref)).toMatchObject({ state: 'checking' });
  });

  it('never verifies by a received time too far ahead or too old (LSN-15)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ahead = trx();
    const old = trx();
    const ref = await placed(setup);
    await typeId(ref, ahead);
    const sent = await send(phone, [
      sms(receiptText(ahead), { receivedAt: new Date(Date.now() + 60 * MINUTE) }),
      sms(receiptText(old), { receivedAt: new Date(Date.now() - 8 * 24 * 60 * MINUTE) }),
    ]);
    expect((sent.body as UploadBody).results.map((row) => row.ignoredReason)).toEqual([
      'too_new',
      'too_old',
    ]);
    expect(await pageBody(ref)).toMatchObject({ state: 'checking' });
    expect(await messageOf(setup.shop.tenantId, ahead)).toMatchObject([
      { status: 'ignored', raw_text: null, amount: '300.00' },
    ]);
  });

  it("lets Lytro's list of senders change, for every shop (LSN-16, amended 2026-11-02)", async () => {
    const settings = app.get(PlatformSettingsService);
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    expect(phone.senders).toEqual(['bKash']);
    await settings.set(PlatformSettingKey.ListenerSenders, ['bKash', '16247'], randomUUID());
    try {
      const id = trx();
      const sent = await send(phone, [sms(receiptText(id), { sender: '16247' })]);
      expect((sent.body as UploadBody).results[0]).toMatchObject({ status: 'unmatched' });
      expect((await beat(phone)).body).toMatchObject({ senders: ['bKash', '16247'] });
      await expect(
        settings.set(PlatformSettingKey.ListenerSenders, 'bKash', randomUUID()),
      ).rejects.toBeTruthy();
    } finally {
      await settings.set(PlatformSettingKey.ListenerSenders, ['bKash'], randomUUID());
    }
  });

  it("keeps an unreadable message's shape for Lytro, and tells them once a day when it jumps (VER-06, amended 2026-11-02)", async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const wording = (index: number): string =>
      `Tk ${String(100 + index)}.00 reached your account from Karim 0181100000${String(index % 10)}. Balance Tk 700.00. TrxID A${String(index)}BCDEFG at 02/11/2026`;
    const sent = await send(
      phone,
      Array.from({ length: 22 }, (_unused, index) => sms(wording(index))),
    );
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect((sent.body as UploadBody).results[0]).toMatchObject({
      status: 'ignored',
      ignoredReason: 'unknown_format',
    });
    // The shop keeps no text; Lytro keeps one shape, counted.
    const rows = await allMessages(setup.shop.tenantId);
    expect(rows.every((row) => row.raw_text === null && row.transaction_id === null)).toBe(true);
    const shapes = await app.get(ListenerReceipts).unread(7);
    expect(shapes).toMatchObject([
      {
        shape: 'Tk # reached your account from #. Balance Tk #. TrxID # at #',
        count: 22,
      },
    ]);
    expect(JSON.stringify(shapes)).not.toMatch(/Karim|\d{5}/);
    expect(unread).toHaveLength(1);
    // A message from any other sender leaves no shape.
    await send(phone, [sms(wording(1), { sender: 'Stranger' })]);
    expect((await app.get(ListenerReceipts).unread(7))[0]?.count).toBe(22);
  });
});

describeIfDatabase('limits on uploads (LSN-07, LSN-13, LSN-14, LSN-19, LSN-20)', () => {
  it('answers 413 past 50 messages, 1,000 characters or 64 KB', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const fifty = Array.from({ length: 50 }, () => sms('Hello'));
    expect((await send(phone, fifty)).status).toBe(200);
    expect((await send(phone, [...fifty, sms('Hello')])).status).toBe(413);
    expect((await send(phone, [sms('x'.repeat(1000))])).status).toBe(200);
    expect((await send(phone, [sms('x'.repeat(1001))])).status).toBe(413);
    // Bangla takes three bytes a character: few enough messages, short enough each, too many bytes.
    const wide = Array.from({ length: 25 }, () => sms('ক'.repeat(1000)));
    expect((await send(phone, wide)).status).toBe(413);
    expect((await send(phone, wide.slice(0, 20))).status).toBe(200);
  });

  it('limits a phone to 30 uploads a minute and a shop to 120 (LSN-13)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    for (let index = 0; index < 30; index += 1) {
      expect((await send(phone, [sms('Hello')])).status).toBe(200);
    }
    const refused = await send(phone, [sms('Hello')]);
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
    // The heartbeat has its own limit, so a phone that uploaded still reports.
    expect((await beat(phone)).status).toBe(200);

    const limits = new ListenerLimits();
    const now = new Date();
    for (let index = 0; index < 120; index += 1) {
      limits.admitUpload(`phone-${String(index)}`, 'shop', now);
    }
    expect(() => {
      limits.admitUpload('phone-121', 'shop', now);
    }).toThrow();
    expect(() => {
      limits.admitUpload('phone-122', 'another-shop', now);
    }).not.toThrow();
  });

  it('stores nothing from a shop that may not listen, and answers a revoked phone 401 (LSN-07, LSN-19)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    await admin.query('UPDATE control.tenants SET suspended_at = now() WHERE id = $1', [
      setup.shop.tenantId,
    ]);
    const offline = await send(phone, [sms(receiptText(trx()))]);
    expect(errorOf(offline).code).toBe('tenant_offline');
    expect(await allMessages(setup.shop.tenantId)).toEqual([]);
    await admin.query('UPDATE control.tenants SET suspended_at = NULL WHERE id = $1', [
      setup.shop.tenantId,
    ]);
    const revoked = await postJson(
      port,
      `/listener/devices/${phone.deviceId}/revoke`,
      {},
      setup.shop.headers(),
    );
    expect(revoked.status, JSON.stringify(revoked.body)).toBeLessThan(300);
    expect((await send(phone, [sms('Hello')])).status).toBe(401);
    expect(await allMessages(setup.shop.tenantId)).toEqual([]);
  });

  it('flags a flood to its owner and Lytro once, and counts uploads today (LSN-14, LSN-20)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const batch = Array.from({ length: 50 }, () => sms('Hello'));
    for (let index = 0; index < 10; index += 1) {
      expect((await send(phone, batch)).status).toBe(200);
    }
    expect(noticesFor(volume, setup.shop)).toEqual([]);
    await send(phone, [sms('Hello')]);
    await send(phone, [sms('Hello')]);
    expect(noticesFor(volume, setup.shop)).toMatchObject([{ deviceId: phone.deviceId }]);
    expect(await logged(setup.shop.tenantId, 'listener_volume_flagged')).toHaveLength(1);
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM control.platform_audit_log
        WHERE action = 'listener_volume_flagged' AND summary->>'tenantId' = $1`,
      [setup.shop.tenantId],
    );
    expect(rows[0]?.n).toBe(1);
    const listed = await setup.shop.get('/listener/devices');
    expect(listed.body).toMatchObject({ devices: [{ id: phone.deviceId, uploadsToday: 502 }] });
    // Tomorrow's uploads start again from nothing.
    await admin.query(
      'UPDATE control.listener_devices SET uploads_day = uploads_day - 1 WHERE id = $1',
      [phone.deviceId],
    );
    expect((await setup.shop.get('/listener/devices')).body).toMatchObject({
      devices: [{ uploadsToday: 0 }],
    });
  });
});

describeIfDatabase("test mode and the app's own reads (LSN-04, Slice 5.5's sketch)", () => {
  it('reads an unknown sender in test mode, shows it, verifies nothing, and ends after 10 minutes (LSN-04)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    const notYet = await send(phone, [sms(receiptText(trx()), { sender: 'Stranger' })]);
    expect((notYet.body as UploadBody).results[0]).toMatchObject({
      ignoredReason: 'unknown_sender',
      transactionId: null,
    });

    const started = await sendExact(
      port,
      'POST',
      '/v1/listener/test-mode',
      undefined,
      phoneHeaders(phone),
    );
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const until = (started.body as { testModeUntil: string }).testModeUntil;
    expect(new Date(until).getTime()).toBeGreaterThan(Date.now() + 9 * MINUTE);
    expect((await beat(phone)).body).toMatchObject({ testModeUntil: until });
    expect(await logged(setup.shop.tenantId, 'listener_test_mode_started')).toHaveLength(1);

    const sent = await send(phone, [
      sms(receiptText(id), { sender: 'Stranger' }),
      sms('Hello from a friend', { sender: 'Stranger' }),
    ]);
    expect((sent.body as UploadBody).testModeUntil).toBe(until);
    expect((sent.body as UploadBody).results).toMatchObject([
      { status: 'ignored', ignoredReason: 'test_mode', transactionId: id },
      { status: 'ignored', ignoredReason: 'unknown_sender', transactionId: null },
    ]);
    // Read and shown, with no text kept, and the payment that typed its ID still waits.
    expect(await messageOf(setup.shop.tenantId, id)).toMatchObject([
      { status: 'ignored', raw_text: null, amount: '300.00' },
    ]);
    expect(await pageBody(ref)).toMatchObject({ state: 'checking' });
    const recent = await sendExact(
      port,
      'GET',
      '/v1/listener/messages',
      undefined,
      phoneHeaders(phone),
    );
    expect((recent.body as { receipts: unknown[] }).receipts).toMatchObject([
      { ignoredReason: 'test_mode', transactionId: id, sender: 'Stranger', method: 'bkash' },
    ]);

    // The real receipt from bKash still verifies it.
    expect(await forward(phone, receiptText(id))).toMatchObject({ status: 'matched' });

    clockShift = 11 * MINUTE;
    const over = await send(phone, [sms(receiptText(trx()), { sender: 'Stranger' })]);
    expect((over.body as UploadBody).testModeUntil).toBeNull();
    expect((over.body as UploadBody).results[0]).toMatchObject({
      ignoredReason: 'unknown_sender',
    });
  });

  it("names the shop's bKash number and the senders on pairing and on each report", async () => {
    const setup = await paidShop();
    // LSN-06: a wallet no phone can read yet stays off the app's answers.
    const nagad = await setup.shop.put('/payment-methods/nagad', {
      enabled: true,
      accounts: [
        { accountName: 'Rahim', number: '01711000005', accountType: 'personal', active: true },
      ],
    });
    expect(nagad.status, JSON.stringify(nagad.body)).toBe(200);
    const phone = await phoneOf(setup.shop);
    expect(phone).toMatchObject({
      accounts: [{ method: 'bkash', number: '01711000001' }],
      senders: ['bKash'],
      testModeUntil: null,
    });
    expect((await beat(phone)).body).toMatchObject({
      status: 'connected',
      accounts: [{ method: 'bkash', number: '01711000001' }],
    });
    const off = await setup.shop.put('/payment-methods/bkash', {
      enabled: false,
      accounts: [
        {
          accountName: 'Rahim Store',
          number: '01711000001',
          accountType: 'personal',
          active: true,
        },
      ],
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect((await beat(phone)).body).toMatchObject({ accounts: [] });
  });

  it("shows a phone its own receipts as they stand, and today's counts", async () => {
    const setup = await paidShop();
    const [phone, otherPhone] = [await phoneOf(setup.shop), await phoneOf(setup.shop)];
    const ref = await placed(setup);
    const paidId = trx();
    await typeId(ref, paidId);
    await forward(phone, receiptText(paidId));
    const waiting = trx();
    await forward(phone, receiptText(waiting));
    const mismatch = await placed(setup);
    const mismatchId = trx();
    await typeId(mismatch, mismatchId);
    await forward(phone, receiptText(mismatchId, '10.00'));
    await forward(phone, 'Your bKash verification code is 482910.');
    await forward(otherPhone, receiptText(trx()));
    // Yesterday's waits on the list but not in today's count.
    const old = trx();
    await send(phone, [
      sms(receiptText(old), { receivedAt: new Date(Date.now() - 26 * 60 * MINUTE) }),
    ]);

    const read = await sendExact(
      port,
      'GET',
      '/v1/listener/messages?limit=10',
      undefined,
      phoneHeaders(phone),
    );
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const body = read.body as {
      receipts: { transactionId: string; status: string; orderNumber: string | null }[];
      today: unknown;
    };
    expect(body.receipts.map((row) => row.transactionId).sort()).toEqual(
      [paidId, waiting, mismatchId, old].sort(),
    );
    expect(body.today).toEqual({ verified: 1, waiting: 1, toCheck: 1 });
    const orderNumber = (await orderOf(setup.shop, ref))['orderNumber'];
    expect(body.receipts.find((row) => row.transactionId === paidId)).toMatchObject({
      status: 'matched',
      orderNumber,
    });
    expect(JSON.stringify(body)).not.toContain('You have received');
  });

  it('lets a phone unpair itself, freeing its place, in both logs (the app menu)', async () => {
    const setup = await payingShop();
    const phone = await phoneOf(setup.shop);
    const full = await postJson(port, '/listener/pairing-codes', {}, setup.shop.headers());
    expect(full.status).not.toBe(201);
    const done = await sendExact(
      port,
      'POST',
      '/v1/listener/unpair',
      undefined,
      phoneHeaders(phone),
    );
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const refused = await beat(phone);
    expect(refused.status).toBe(401);
    expect(errorOf(refused).details).toMatchObject({ reason: 'device' });
    expect(await logged(setup.shop.tenantId, 'listener_device_revoked')).toMatchObject([
      { reason: 'device' },
    ]);
    await phoneOf(setup.shop);
  });

  it("clears a deleted customer's number and receipt text, keeping the ID and amount (CUS-09)", async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const buyer = texts.freshPhone();
    // One receipt claims their closed order's payment.
    const rejectedRef = await placed(setup, buyer);
    const closedId = trx();
    await typeId(rejectedRef, closedId);
    const session = await sessionOf(rejectedRef);
    await postJson(
      port,
      `/payments/${session.id}/reject`,
      { reason: 'no_payment_found' },
      setup.shop.headers(),
    );
    await forward(phone, receiptText(closedId, '300.00', '01911000077'));
    // Another became a payment staff recorded on their order, since finished.
    const recordedRef = await placed(setup, buyer);
    const recordedId = trx();
    const recordedOrder = (await sessionOf(recordedRef)).order_id;
    await forward(phone, receiptText(recordedId, '300.00', '01911000078'));
    await postJson(
      port,
      `/orders/${recordedOrder}/payments`,
      { method: 'bkash', amount: 300, transactionId: recordedId, senderNumber: SENDER_NUMBER },
      setup.shop.headers(),
    );
    await admin.query(
      `UPDATE tenant.orders SET status_override = 'cancelled', cancel_reason = 'customer_cancelled',
         cancelled_at = now() WHERE id = $1`,
      [recordedOrder],
    );
    // A third, from their number, nobody claimed; a fourth is a stranger's.
    const unclaimedId = trx();
    await forward(phone, receiptText(unclaimedId, '50.00', buyer));
    const strangerId = trx();
    await forward(phone, receiptText(strangerId, '60.00', '01911000088'));

    const customerId = (await orderOf(setup.shop, rejectedRef))['customerId'] as string;
    const erased = await setup.shop.delete(`/customers/${customerId}`);
    expect(erased.status, JSON.stringify(erased.body)).toBe(200);
    for (const id of [closedId, recordedId, unclaimedId]) {
      const [row] = await messageOf(setup.shop.tenantId, id);
      expect(row, id).toMatchObject({ raw_text: null, transaction_id: id });
      expect(row?.amount, id).toBeTruthy();
    }
    expect((await messageOf(setup.shop.tenantId, strangerId))[0]?.raw_text).toBeTruthy();
    const { rows } = await admin.query<{ transaction_id: string; sender_number: string | null }>(
      'SELECT transaction_id, sender_number FROM tenant.listener_messages WHERE tenant_id = $1',
      [setup.shop.tenantId],
    );
    expect(rows.filter((row) => row.sender_number !== null)).toEqual([
      { transaction_id: strangerId, sender_number: '01911000088' },
    ]);
  });

  it('takes the messages away with the shop at day 60 (LSN-23)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    await forward(phone, receiptText(trx()));
    await app.get(ListenerDevices).deleteAllForTenant(setup.shop.tenantId);
    expect(await allMessages(setup.shop.tenantId)).toEqual([]);
  });
});

describeIfDatabase('redacting and tidying (LSN-17)', () => {
  it('redacts receipt text past 90 days, keeping the rest, and removes what verifies nothing', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const oldId = trx();
    const newId = trx();
    await forward(phone, receiptText(oldId));
    await forward(phone, receiptText(newId));
    await send(phone, [sms('Hello', { sender: 'Stranger' })]);
    await admin.query(
      `UPDATE tenant.listener_messages SET received_at = now() - interval '91 days'
        WHERE tenant_id = $1 AND (transaction_id = $2 OR status = 'ignored')`,
      [setup.shop.tenantId, oldId],
    );
    await admin.query(
      `INSERT INTO control.listener_unread_shapes (day, shape_hash, shape, count)
       VALUES (current_date - 91, repeat('a', 64), 'old', 1)`,
    );
    const done = await app.get(ListenerReceipts).redactOld(new Date());
    expect(done.redacted).toBeGreaterThanOrEqual(1);
    expect(done.removed).toBeGreaterThanOrEqual(1);
    expect(await messageOf(setup.shop.tenantId, oldId)).toMatchObject([
      { raw_text: null, status: 'unmatched', amount: '300.00', transaction_id: oldId },
    ]);
    expect((await messageOf(setup.shop.tenantId, newId))[0]?.raw_text).toBe(receiptText(newId));
    expect(
      (await allMessages(setup.shop.tenantId)).filter((row) => row.status === 'ignored'),
    ).toEqual([]);
    const { rows } = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM control.listener_unread_shapes WHERE shape = 'old'",
    );
    expect(rows[0]?.n).toBe(0);
    // Safe to run again.
    await expect(app.get(ListenerReceipts).redactOld(new Date())).resolves.toBeTruthy();
  });
});

describeIfDatabase('telling staff (VER-01, VER-07)', () => {
  it('waits 5 minutes while a phone may verify, then tells staff once; the page shows the phone gone', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    const typed = await typeId(ref, id);
    expect(typed.body).toMatchObject({ state: 'checking', listenerOnline: true });
    const expiry = app.get(PaymentSessionExpiry);
    expect((await expiry.runTick(new Date(Date.now() + 4 * MINUTE))).told).toBe(0);
    expect(noticesFor(toVerify, setup.shop)).toEqual([]);
    expect((await expiry.runTick(new Date(Date.now() + 6 * MINUTE))).told).toBeGreaterThan(0);
    expect(noticesFor(toVerify, setup.shop)).toMatchObject([{ transactionId: id }]);
    await expiry.runTick(new Date(Date.now() + 7 * MINUTE));
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(1);
    // The phone reported 31 minutes ago: the page says the shop will check.
    await admin.query(
      "UPDATE control.listener_devices SET last_seen_at = now() - interval '31 minutes' WHERE id = $1",
      [phone.deviceId],
    );
    expect(await pageBody(ref)).toMatchObject({ state: 'checking', listenerOnline: false });
  });

  it('tells staff at once when no phone is online', async () => {
    const setup = await paidShop();
    const none = await placed(setup);
    expect((await typeId(none, trx())).body).toMatchObject({ listenerOnline: false });
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(1);
    const phone = await phoneOf(setup.shop);
    await admin.query(
      "UPDATE control.listener_devices SET last_seen_at = now() - interval '31 minutes' WHERE id = $1",
      [phone.deviceId],
    );
    const gone = await placed(setup);
    expect((await typeId(gone, trx())).body).toMatchObject({ listenerOnline: false });
    expect(noticesFor(toVerify, setup.shop)).toHaveLength(2);
  });

  it('never tells staff of a payment the phone verified in time', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await typeId(ref, id);
    await forward(phone, receiptText(id));
    await app.get(PaymentSessionExpiry).runTick(new Date(Date.now() + 6 * MINUTE));
    expect(noticesFor(toVerify, setup.shop)).toEqual([]);
  });
});

describeIfDatabase('a shopper correcting a typed ID (PAY-07, agreed 2026-11-02)', () => {
  it('lets the shopper correct a typo, which then finds its receipt; each is logged', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const wrong = trx();
    const right = trx();
    await typeId(ref, wrong);
    expect(await pageBody(ref)).toMatchObject({ idChangesLeft: 3 });
    await forward(phone, receiptText(right));
    const fixed = await correctId(ref, right.toLowerCase());
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200);
    expect(fixed.body).toMatchObject({
      state: 'verified',
      idChangesLeft: 0,
      submitted: { transactionId: right },
    });
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);
    expect(await logged(setup.shop.tenantId, 'payment_id_changed')).toMatchObject([
      { from: wrong, to: right },
    ]);
  });

  it('allows 3 corrections, in checking or with staff; never once decided, nor to an ID in use', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const first = trx();
    await typeId(ref, first);
    // It went to staff on the wrong receipt; correcting it frees that receipt and waits again.
    await forward(phone, receiptText(first, '10.00'));
    expect(await pageBody(ref)).toMatchObject({ state: 'needs_review' });
    const second = trx();
    expect(await (await correctId(ref, second)).body).toMatchObject({
      state: 'checking',
      review: null,
      idChangesLeft: 2,
    });
    expect(await messageOf(setup.shop.tenantId, first)).toMatchObject([
      { status: 'unmatched', session_id: null, review_reason: null },
    ]);
    expect((await correctId(ref, trx())).body).toMatchObject({ idChangesLeft: 1 });
    expect((await correctId(ref, trx())).body).toMatchObject({ idChangesLeft: 0 });
    const usedUp = await correctId(ref, trx());
    expect(usedUp.status).toBe(409);
    expect(errorOf(usedUp).message).toBeTruthy();

    // An ID a payment holds is refused, as typing it is.
    const another = await placed(setup);
    const takenId = trx();
    await typeId(another, takenId);
    await forward(phone, receiptText(takenId));
    const elsewhere = await placed(setup);
    await typeId(elsewhere, trx());
    expect((await correctId(elsewhere, takenId)).status).toBe(409);

    // Once someone decided, it stays.
    expect((await correctId(another, trx())).status).toBe(409);
    const session = await sessionOf(elsewhere);
    await postJson(port, `/payments/${session.id}/verify`, {}, setup.shop.headers());
    expect((await correctId(elsewhere, trx())).status).toBe(409);
  });

  it('refuses a page awaiting payment, where nothing was typed yet', async () => {
    const setup = await paidShop();
    const ref = await placed(setup);
    expect((await correctId(ref, trx())).status).toBe(409);
  });
});

describeIfDatabase('the receipts staff read (agreed 2026-11-02)', () => {
  it('lists and searches with payments:verify, their own shop only; text shown until redacted', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const unclaimed = trx();
    await forward(phone, receiptText(unclaimed));
    const ref = await placed(setup);
    const mismatch = trx();
    await typeId(ref, mismatch);
    await forward(phone, receiptText(mismatch, '777.00', '01911000009'));
    await forward(phone, 'Your bKash verification code is 482910.');

    const all = await setup.shop.get('/listener/receipts');
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body).toMatchObject({ total: 2, page: 1 });
    const open = await setup.shop.get('/listener/receipts?status=unmatched');
    expect(open.body).toMatchObject({
      total: 1,
      receipts: [
        {
          transactionId: unclaimed,
          senderNumber: SENDER_NUMBER,
          amount: '300.00',
          deviceId: phone.deviceId,
          text: receiptText(unclaimed),
          orderNumber: null,
        },
      ],
    });
    const orderNumber = (await orderOf(setup.shop, ref))['orderNumber'];
    expect((await setup.shop.get('/listener/receipts?status=needs_review')).body).toMatchObject({
      receipts: [{ transactionId: mismatch, reviewReason: 'amount', orderNumber }],
    });
    for (const q of [mismatch.slice(0, 5).toLowerCase(), '01911000009', '777']) {
      const found = await setup.shop.get(`/listener/receipts?q=${q}`);
      expect(found.body, q).toMatchObject({ total: 1, receipts: [{ transactionId: mismatch }] });
    }
    // payments:read alone sees no receipts; another shop sees none of these.
    const reader = await staffWith(port, texts, admin, setup.shop, ['payments:read']);
    expect((await getJson(port, '/listener/receipts', reader)).status).toBe(403);
    const other = await payingShop();
    const verifier = await staffWith(port, texts, admin, other.shop, ['payments:verify']);
    const theirs = await getJson(port, '/listener/receipts', verifier);
    expect(theirs.status).toBe(200);
    expect(theirs.body).toMatchObject({ total: 0 });
  });
});

describeIfDatabase("through the page itself (Slice 5.8's part 2, VER-02, VER-04, PAY-17)", () => {
  const type = (ref: string, transactionId: string, senderNumber = SENDER_NUMBER) =>
    payPage(port, 'POST', `/${ref}/transaction`, { method: 'bkash', transactionId, senderNumber });
  const status = async (ref: string, query = ''): Promise<string> =>
    (JSON.parse((await payPage(port, 'GET', `/${ref}/status${query}`)).text) as { screen: string })
      .screen;

  it('shows a phone matching it, then sees the receipt arrive and returns to the shop', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    const typed = await type(ref, id);
    expect(typed.status).toBe(303);

    const waiting = await payPage(port, 'GET', String(typed.headers.location));
    expect(screenOf(waiting)).toBe('checking');
    expect(waiting.text).toContain('SMS মেলানো হচ্ছে');
    expect(waiting.text).toContain('data-typed=');
    expect(waiting.text).toContain('data-poll="1"');
    expect(await status(ref)).toBe('checking');

    await forward(phone, receiptText(id));

    // What the page's own check reads, which is what makes it go on by itself (PAY-17).
    expect(await status(ref, '?just=1')).toBe('verified');
    const paid = await payPage(port, 'GET', `/${ref}?just=1`);
    expect(screenOf(paid)).toBe('verified');
    expect(paid.text).toContain('status=verified');
    expect(paid.text).toContain(id);
  });

  it('settles at once when the receipt came first (VER-04)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const ref = await placed(setup);
    const id = trx();
    await forward(phone, receiptText(id));
    const typed = await type(ref, id);
    expect(screenOf(await payPage(port, 'GET', String(typed.headers.location)))).toBe('verified');
  });

  it('past 30 seconds says it will confirm shortly, and the page may be closed (PAY-17)', async () => {
    const setup = await paidShop();
    await phoneOf(setup.shop);
    const ref = await placed(setup);
    await type(ref, trx());
    await admin.query(
      "UPDATE tenant.payment_sessions SET submitted_at = now() - interval '31 seconds' WHERE ref = $1",
      [ref],
    );
    const late = await payPage(port, 'GET', `/${ref}`);
    expect(screenOf(late)).toBe('late');
    expect(late.text).toContain('এই পেজ বন্ধ করলেও হবে');
    expect(late.text).not.toContain('SMS পাবেন');
    expect(await status(ref)).toBe('late');
  });

  it('says plainly when the amount or the sender did not match, and lets the ID be corrected', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);

    const short = await placed(setup);
    const shortId = trx();
    await type(short, shortId);
    await forward(phone, receiptText(shortId, '250.00'));
    const amount = await payPage(port, 'GET', `/${short}`);
    expect(screenOf(amount)).toBe('review');
    expect(amount.text).toContain('টাকা মিলছে না');
    expect(amount.text).toContain('?change=1');

    const other = await placed(setup);
    const otherId = trx();
    await type(other, otherId, '01911000009');
    await forward(phone, receiptText(otherId));
    expect(screenOf(await payPage(port, 'GET', `/${other}`))).toBe('review-sender');
  });

  it('leaves a wallet checked by hand with staff, whatever a phone reports (agreed 2026-11-03)', async () => {
    const setup = await paidShop();
    const phone = await phoneOf(setup.shop);
    const way = await setup.shop.put('/payment-methods/bkash/way', { way: 'manual' });
    expect(way.status, JSON.stringify(way.body)).toBe(200);
    const ref = await placed(setup);
    const id = trx();
    await type(ref, id);
    expect(screenOf(await payPage(port, 'GET', `/${ref}`))).toBe('manual');
    await forward(phone, receiptText(id));
    expect(screenOf(await payPage(port, 'GET', `/${ref}`))).toBe('manual');
  });
});
