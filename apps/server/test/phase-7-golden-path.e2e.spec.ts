import 'dotenv/config';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NotificationKind,
  SMS_EVENTS,
  SmsEvent,
  renderSmsTemplate,
  smsWithName,
  takaFigure,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { COURIER_FETCH, COURIER_PAUSE } from '../src/modules/couriers/tokens';
import type {
  PushMessage,
  PushOptions,
  PushOutcome,
  PushProvider,
  PushTarget,
} from '../src/modules/notifications/ports/push-provider';
import type { NotificationPushJob } from '../src/modules/notifications/services/notifications';
import { PushSender } from '../src/modules/notifications/services/push-sender';
import { PUSH_PROVIDER } from '../src/modules/notifications/tokens';
import type { SmsEventJob } from '../src/modules/sms-events/services/sms-event-queue';
import { SmsEventSender } from '../src/modules/sms-events/services/sms-event-sender';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { CourierNightTickWorker } from '../src/modules/shared/queue-workers/services/courier-night-tick-worker';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { NoticePublishTickWorker } from '../src/modules/shared/queue-workers/services/notice-publish-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { FakeSteadfast, freshSteadfastKeys, signatureOf } from './support/fake-steadfast';
import { postToApiHost } from './support/http';
import { PrepaidPath, receiptOf, trx } from './support/prepaid-path';
import type { ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// PHASE-7-PLAN §1, exit criterion 3 (the Phase 7 close-out, 2026-11-08): one golden path against the fakes. A shopper's
// order → the "order placed" SMS in the shop's Bangla words with its SMS name first → the owner's bell and push show the
// new order → the advance verified → its SMS → the courier's news ships it → the shipped SMS with its tracking link →
// delivered. At every step the SMS sent, the SMS log, the ledger, the balance and the notifications agree. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_phase7_golden_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STOREFRONT_SECRET = 'phase7-golden-storefront-secret-0123456789abcdef';
const AT = '2026-11-08 10:00:00';
vi.setConfig({ testTimeout: 120_000 });

/** The push service, faked: every push is kept, and every one is taken. */
class PushCapture implements PushProvider {
  readonly publicKey = 'BGoldenPathTestKeyNotUsedBecauseNothingIsEncrypted';
  readonly sent: { target: PushTarget; message: PushMessage; options: PushOptions }[] = [];

  send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushOutcome> {
    this.sent.push({ target, message, options });
    return Promise.resolve('sent');
  }
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
let path: PrepaidPath;
const texts = new SmsCapture();
const steadfast = new FakeSteadfast();
const pushes = new PushCapture();
const ranSms = new Set<string>();
const ranPush = new Set<string>();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'phase7-golden-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(PUSH_PROVIDER)
    .useValue(pushes)
    .overrideProvider(COURIER_FETCH)
    .useValue(steadfast.fetch)
    .overrideProvider(COURIER_PAUSE)
    .useValue(() => Promise.resolve())
    // The spec moves every step itself, so no pass races it.
    .overrideProvider(CourierBookingTickWorker)
    .useValue({})
    .overrideProvider(CourierNightTickWorker)
    .useValue({})
    .overrideProvider(GatewayReconcileTickWorker)
    .useValue({})
    .overrideProvider(PaymentSessionExpiryTickWorker)
    .useValue({})
    .overrideProvider(NoticePublishTickWorker)
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

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  due: string;
  grandTotal: string;
  trackingId?: string;
  parcel: { state: string; consignmentId: string | null; reading: string | null } | null;
}

/** Sends every order SMS queued for the shop that hasn't gone yet, as the worker would. */
async function sendSms(tenantId: string): Promise<void> {
  const { rows } = await admin.query<{ job: string; payload: SmsEventJob }>(
    `SELECT id::text AS job, payload FROM control.job_outbox
     WHERE queue_name = 'order_sms' AND payload->>'tenantId' = $1 ORDER BY id`,
    [tenantId],
  );
  for (const row of rows) {
    if (ranSms.has(row.job)) continue;
    ranSms.add(row.job);
    await app.get(SmsEventSender).send(row.payload);
  }
}

/** Sends every push queued for the shop that hasn't gone yet, as the worker would. */
async function sendPushes(tenantId: string): Promise<void> {
  const { rows } = await admin.query<{ job: string; payload: NotificationPushJob }>(
    `SELECT id::text AS job, payload FROM control.job_outbox
     WHERE queue_name = 'notification_push' AND payload->>'tenantId' = $1 ORDER BY id`,
    [tenantId],
  );
  for (const row of rows) {
    if (ranPush.has(row.job)) continue;
    ranPush.add(row.job);
    await app.get(PushSender).send(row.payload);
  }
}

/** The owner's bell, oldest first: each notification's kind and its words in Bangla. */
async function bellOf(
  tenantId: string,
): Promise<{ kind: string; title: string; link: string | null }[]> {
  const { rows } = await admin.query<{
    kind: string;
    words: { bn: { title: string } };
    link: string | null;
  }>(
    `SELECT n.kind, n.words, n.link FROM tenant.notifications n
     JOIN tenant.users u ON u.tenant_id = n.tenant_id AND u.id = n.user_id
     WHERE n.tenant_id = $1 AND u.is_owner ORDER BY n.created_at, n.id`,
    [tenantId],
  );
  return rows.map((row) => ({ kind: row.kind, title: row.words.bn.title, link: row.link }));
}

/**
 * Everything that must agree after each step:
 * - every SMS the log says was sent was sent, word for word, to its phone, and nothing more;
 * - what the sent SMS cost is what the ledger took for SMS (SMS-04, SMS-08);
 * - the shop's cached balance is its ledger's sum (BAL-11);
 * - every bell row went out as a push to the owner's browser, in Bangla, the language they haven't changed.
 */
async function expectAgreement(shop: ShopClient, ownerEndpoint: string): Promise<void> {
  const tenantId = shop.tenantId;
  const log = await admin.query<{
    to_phone: string;
    body: string | null;
    cost: string;
    status: string;
  }>(
    "SELECT to_phone, body, cost::text, status FROM tenant.sms_log WHERE tenant_id = $1 AND kind <> 'otp' ORDER BY id",
    [tenantId],
  );
  const sentRows = log.rows.filter((row) => row.status === 'sent');
  const phones = new Set(sentRows.map((row) => row.to_phone));
  const captured = texts.sent.filter((sms) => phones.has(sms.toPhone));
  expect(captured.map((sms) => [sms.toPhone, sms.body])).toEqual(
    sentRows.map((row) => [row.to_phone, row.body]),
  );
  const spent = sentRows.reduce((sum, row) => sum + Math.round(Number(row.cost) * 100), 0);
  const charged = await admin.query<{ net: string }>(
    `SELECT coalesce(-sum(amount), 0)::numeric(12, 2)::text AS net FROM tenant.balance_ledger
     WHERE tenant_id = $1 AND (type = 'sms' OR (type = 'reversal' AND reference->>'reason' = 'sms_not_sent'))`,
    [tenantId],
  );
  expect(Math.round(Number(charged.rows[0]?.net) * 100)).toBe(spent);
  const balance = await admin.query<{ cached: string; ledger: string }>(
    `SELECT t.balance_amount::text AS cached,
       (SELECT coalesce(sum(amount), 0)::numeric(12, 2)::text FROM tenant.balance_ledger l WHERE l.tenant_id = t.id) AS ledger
     FROM control.tenants t WHERE t.id = $1`,
    [tenantId],
  );
  expect(balance.rows[0]?.cached).toBe(balance.rows[0]?.ledger);
  await sendPushes(tenantId);
  const bell = await bellOf(tenantId);
  const ownPushes = pushes.sent.filter((push) => push.target.endpoint === ownerEndpoint);
  expect(ownPushes.map((push) => push.message.title)).toEqual(bell.map((row) => row.title));
  for (const [index, push] of ownPushes.entries()) {
    expect(push.message.url).toBe(`/${shop.slug}${bell[index]?.link ?? ''}`);
  }
}

/** Steadfast's news, as its message to the shop's own address brings it, applied before this returns. */
async function steadfastSays(
  address: string,
  token: string,
  tenantId: string,
  order: Order,
  status: string,
): Promise<void> {
  const body = {
    notification_type: 'delivery_status',
    consignment_id: Number(order.parcel?.consignmentId),
    invoice: order.orderNumber,
    cod_amount: Number(order.due),
    status,
    delivery_charge: 60,
    tracking_message: `Your parcel is ${status}.`,
    updated_at: AT,
  };
  const answered = await postToApiHost(port, address, body, {
    'x-signature': signatureOf(JSON.stringify(body), token),
    'idempotency-key': randomUUID(),
  });
  expect(answered.status, JSON.stringify(answered.body)).toBe(202);
  await vi.waitFor(
    async () => {
      const { rows } = await admin.query(
        'SELECT 1 FROM tenant.courier_events WHERE tenant_id = $1 AND applied_at IS NULL',
        [tenantId],
      );
      expect(rows).toHaveLength(0);
    },
    { timeout: 10_000, interval: 50 },
  );
}

async function read(shop: ShopClient, orderId: string): Promise<Order> {
  const got = await shop.get(`/orders/${orderId}`);
  expect(got.status, JSON.stringify(got.body)).toBe(200);
  return got.body as Order;
}

describeIfDatabase("Phase 7's golden path (PHASE-7-PLAN §1, exit criterion 3)", () => {
  it("takes a shopper's order from placed to delivered, its SMS, ledger, bell and push agreeing at every step", async () => {
    const setup = await path.shop('gold7');
    const shop = setup.shop;
    const tenantId = shop.tenantId;
    const smsName = `Shop ${shop.slug}`;

    // The owner turns push on in a browser, and connects Steadfast.
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const ownerEndpoint = `https://fcm.googleapis.com/fcm/send/golden-${randomUUID()}`;
    const subscribed = await shop.post('/push/subscriptions', {
      endpoint: ownerEndpoint,
      keys: {
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    });
    expect(subscribed.status, JSON.stringify(subscribed.body)).toBeLessThan(300);
    const connected = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: freshSteadfastKeys(),
    });
    expect(connected.status, JSON.stringify(connected.body)).toBe(200);
    const message = (connected.body as { message: { address: string; token: string } }).message;
    const address = new URL(message.address).pathname;
    await expectAgreement(shop, ownerEndpoint);

    // 1. A shopper's order from the landing page: the order-placed SMS in the shop's Bangla words, its SMS name first,
    //    charged at the SMS rate; the owner's bell and push say so.
    const placed = await path.landingOrder(setup);
    const order = await read(shop, placed.orderId);
    await sendSms(tenantId);
    const shopper = texts.sent.at(-1)?.toPhone ?? '';
    const placedSms = smsWithName(
      smsName,
      renderSmsTemplate(SMS_EVENTS[SmsEvent.OrderPlaced].template, {
        order_number: order.orderNumber,
        amount: takaFigure(order.grandTotal),
        customer_name: 'Rahima Akter',
        tracking_link: '',
      }),
    );
    expect(texts.sent.at(-1)?.body).toBe(placedSms);
    expect(placedSms.startsWith(`${smsName}: অর্ডার ${order.orderNumber} পেয়েছি`)).toBe(true);
    expect((await bellOf(tenantId)).map((row) => row.kind)).toEqual([NotificationKind.OrderPlaced]);
    await expectAgreement(shop, ownerEndpoint);
    expect(pushes.sent.at(-1)?.message.url).toBe(`/${shop.slug}/orders/${order.id}`);

    // 2. The advance, verified by the shop's listener phone: its SMS to the shopper, and the bell.
    const phone = await path.pairPhone(shop);
    const transactionId = trx();
    expect((await path.typeId(placed.ref, transactionId)).status).toBe(201);
    expect((await path.forward(phone, receiptOf(transactionId))).status).toBe(200);
    await sendSms(tenantId);
    expect(texts.sent.filter((sms) => sms.toPhone === shopper).at(-1)?.body).toBe(
      smsWithName(
        smsName,
        renderSmsTemplate(SMS_EVENTS[SmsEvent.PaymentVerified].template, {
          order_number: order.orderNumber,
          amount: '300',
          customer_name: 'Rahima Akter',
          tracking_link: '',
        }),
      ),
    );
    expect((await bellOf(tenantId)).map((row) => row.kind)).toEqual([
      NotificationKind.OrderPlaced,
      NotificationKind.PaymentVerified,
    ]);
    await expectAgreement(shop, ownerEndpoint);

    // 3. Confirmed by the call, then booked with Steadfast. Nothing goes to the shopper yet.
    const shopperSmsBefore = texts.countFor(shopper);
    expect((await shop.post(`/orders/${order.id}/calls`, { outcome: 'confirmed' })).status).toBe(
      200,
    );
    const booked = await shop.post(`/orders/${order.id}/book`, {});
    expect(booked.status, JSON.stringify(booked.body)).toBe(200);
    const bookedOrder = booked.body as Order;
    expect(bookedOrder.parcel?.consignmentId).toBeTruthy();
    await sendSms(tenantId);
    expect(texts.countFor(shopper)).toBe(shopperSmsBefore);
    await expectAgreement(shop, ownerEndpoint);

    // 4. Steadfast's news ships it: the shipped SMS with the tracking link; the bell hears of the parcel.
    await steadfastSays(address, message.token, tenantId, bookedOrder, 'pending');
    const shipped = await read(shop, order.id);
    expect(shipped).toMatchObject({ status: 'shipped', fulfillmentStatus: 'shipped' });
    await sendSms(tenantId);
    const tracking = await admin.query<{ tracking_id: string }>(
      'SELECT tracking_id FROM tenant.orders WHERE id = $1',
      [order.id],
    );
    expect(texts.sent.filter((sms) => sms.toPhone === shopper).at(-1)?.body).toBe(
      smsWithName(
        smsName,
        renderSmsTemplate(SMS_EVENTS[SmsEvent.OrderShipped].template, {
          order_number: order.orderNumber,
          amount: '',
          customer_name: 'Rahima Akter',
          tracking_link: `http://${shop.slug}.localhost/track/${tracking.rows[0]?.tracking_id ?? ''}`,
        }),
      ),
    );
    expect((await bellOf(tenantId)).map((row) => row.kind)).toEqual([
      NotificationKind.OrderPlaced,
      NotificationKind.PaymentVerified,
      NotificationKind.ParcelMoved,
    ]);
    await expectAgreement(shop, ownerEndpoint);

    // 5. Delivered: the cash collected, nothing due. The delivered SMS is off until the shop turns it on (SMS-02), so the
    //    shopper hears nothing more and nothing more is charged; the bell hears of it.
    const shopperSmsShipped = texts.countFor(shopper);
    await steadfastSays(address, message.token, tenantId, shipped, 'delivered');
    const delivered = await read(shop, order.id);
    expect(delivered).toMatchObject({
      status: 'delivered',
      fulfillmentStatus: 'delivered',
      paymentStatus: 'paid',
      due: '0.00',
    });
    await sendSms(tenantId);
    expect(texts.countFor(shopper)).toBe(shopperSmsShipped);
    expect((await bellOf(tenantId)).map((row) => row.kind)).toEqual([
      NotificationKind.OrderPlaced,
      NotificationKind.PaymentVerified,
      NotificationKind.ParcelMoved,
      NotificationKind.ParcelMoved,
    ]);
    await expectAgreement(shop, ownerEndpoint);

    // Three SMS to the shopper, three charges, and nothing to the owner's phone (its two alerts are off by default).
    const log = await admin.query<{ kind: string; status: string }>(
      "SELECT kind, status FROM tenant.sms_log WHERE tenant_id = $1 AND kind <> 'otp' ORDER BY id",
      [tenantId],
    );
    expect(log.rows).toEqual([
      { kind: 'order_placed', status: 'sent' },
      { kind: 'payment_verified', status: 'sent' },
      { kind: 'order_shipped', status: 'sent' },
    ]);
  });
});
