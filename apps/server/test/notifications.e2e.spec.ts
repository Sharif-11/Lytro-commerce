import 'dotenv/config';
import { createECDH, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TransactionRunner } from '@lytronix/db';
import {
  CourierKey,
  NotificationKind,
  OrderSource,
  ParcelReading,
  PaymentMethod,
  Permission,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { BREAKER_FAILURES, CircuitOpen } from '../src/common/circuit-breaker';
import { EnvironmentParser } from '../src/config/env';
import { DatabaseService } from '../src/database/database.service';
import type { LowBalanceNotifier } from '../src/modules/balance/ports/low-balance-notifier';
import { LOW_BALANCE_NOTIFIER } from '../src/modules/balance/tokens';
import type { ListenerNotifier } from '../src/modules/listener/ports/listener-notifier';
import { LISTENER_NOTIFIER } from '../src/modules/listener/tokens';
import {
  BellCourierNotifier,
  BellOrderNotifier,
  BellPaymentNotifier,
} from '../src/modules/notifications/notifiers/bell-notifiers';
import type {
  PushMessage,
  PushOptions,
  PushOutcome,
  PushProvider,
  PushTarget,
} from '../src/modules/notifications/ports/push-provider';
import { pushModeOf } from '../src/modules/notifications/providers/push-provider-choice';
import { WebPushProvider } from '../src/modules/notifications/providers/web-push.provider';
import { NotificationPurge } from '../src/modules/notifications/services/notification-purge';
import {
  Notifications,
  type NotificationPushJob,
} from '../src/modules/notifications/services/notifications';
import { PushSender } from '../src/modules/notifications/services/push-sender';
import { PUSH_PROVIDER } from '../src/modules/notifications/tokens';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, sendExact } from './support/http';
import { MailCapture } from './support/mail-capture';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// NTF-01 to NTF-06, D7-38 to D7-44 (Phase 7 Slice 7.3, read agreed 2026-11-07): the bell and push over real HTTP and the
// real database. Each notice is written for the people its kind reaches -- the owner, and the holders of its permission
// -- less those who switched it off, in both languages; the bell shows each reader theirs; each row's push goes to the
// person's browsers in the language they chose; money and account kinds can't be switched off; the clean-up keeps 30
// days. The push service is the one thing faked: a stand-in records each push and answers as the service would. Runs only
// when DATABASE_TEST_ADMIN_URL is set; the parts without a database always run.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_notifications_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('base64')}`;

/** A browser's keys, as the Push API gives them: an uncompressed P-256 public key and a 16-byte secret, base64url. */
function browserKeys(): { p256dh: string; auth: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

describe('Web Push (NTF-02)', () => {
  const vapid = webpush.generateVAPIDKeys();
  const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...browserKeys() };
  const message: PushMessage = {
    title: 't',
    body: 'b',
    url: '/megh/orders/1',
    tag: 'order_placed',
    id: '1',
  };

  function provider(status: number): {
    push: WebPushProvider;
    calls: { url: string; init: RequestInit }[];
  } {
    const calls: { url: string; init: RequestInit }[] = [];
    const push = new WebPushProvider(
      {
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
        subject: 'mailto:no-reply@mail.lytro.app',
      },
      (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(new Response(null, { status }));
      },
    );
    return { push, calls };
  }

  it('PRF-05: five failures in a row open its circuit, and the next push makes no call', async () => {
    const { push, calls } = provider(500);
    const options = { urgency: 'normal', ttlSeconds: 60 } as const;
    for (let tries = 0; tries < BREAKER_FAILURES; tries += 1) {
      await expect(push.send(target, message, options)).rejects.toThrow(/could not take the push/);
    }
    const made = calls.length;
    await expect(push.send(target, message, options)).rejects.toBeInstanceOf(CircuitOpen);
    expect(calls).toHaveLength(made);
  });

  it('signs each push with the VAPID key and encrypts it for the browser, with its urgency and lifetime', async () => {
    const { push, calls } = provider(201);
    expect(await push.send(target, message, { urgency: 'high', ttlSeconds: 86400 })).toBe('sent');
    const call = calls[0];
    expect(call?.url).toBe(target.endpoint);
    expect(call?.init.method).toBe('POST');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(headers['Authorization']).toContain(`k=${vapid.publicKey}`);
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers['TTL']).toBe('86400');
    expect(headers['Urgency']).toBe('high');
    // The body is ciphertext: the message's words never travel in the clear.
    expect(Buffer.from(call?.init.body as Buffer).toString('utf8')).not.toContain('/megh/orders/1');
  });

  it("reads the push service's answer: gone, refused, or worth trying again", async () => {
    expect(
      await provider(410).push.send(target, message, { urgency: 'normal', ttlSeconds: 60 }),
    ).toBe('gone');
    expect(
      await provider(404).push.send(target, message, { urgency: 'normal', ttlSeconds: 60 }),
    ).toBe('gone');
    expect(
      await provider(413).push.send(target, message, { urgency: 'normal', ttlSeconds: 60 }),
    ).toBe('refused');
    await expect(
      provider(503).push.send(target, message, { urgency: 'normal', ttlSeconds: 60 }),
    ).rejects.toThrow(/could not take the push now/);
  });

  it('records in tests, logs in development unless forced, and sends in production, which needs the keys', () => {
    expect(pushModeOf({ NODE_ENV: 'test', PUSH_FORCE_REAL: true })).toBe('record');
    expect(pushModeOf({ NODE_ENV: 'development', PUSH_FORCE_REAL: false })).toBe('log');
    expect(pushModeOf({ NODE_ENV: 'development', PUSH_FORCE_REAL: true })).toBe('send');
    expect(pushModeOf({ NODE_ENV: 'production', PUSH_FORCE_REAL: false })).toBe('send');
    const SECRET = 'x'.repeat(40);
    expect(() =>
      new EnvironmentParser().parse({
        DATABASE_URL: 'postgres://db',
        OTP_SECRET: SECRET,
        PUSH_FORCE_REAL: 'true',
      }),
    ).toThrow(/VAPID_PUBLIC_KEY: required when PUSH_FORCE_REAL is set/);
    const env = new EnvironmentParser().parse({
      DATABASE_URL: 'postgres://db',
      OTP_SECRET: SECRET,
      PUSH_FORCE_REAL: 'true',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
    });
    expect(env.VAPID_SUBJECT).toBe('mailto:no-reply@mail.lytro.app');
  });
});

/** The push service, as the spec plays it: keeps each push, and answers what it's told to. */
class PushCapture implements PushProvider {
  readonly publicKey = webpush.generateVAPIDKeys().publicKey;
  readonly sent: { target: PushTarget; message: PushMessage; options: PushOptions }[] = [];
  answers: PushOutcome[] = [];

  send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushOutcome> {
    this.sent.push({ target, message, options });
    return Promise.resolve(this.answers.shift() ?? 'sent');
  }
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const mail = new MailCapture();
const pushes = new PushCapture();

describeIfDatabase('the bell and push over the real stack', () => {
  let shop: ShopClient;
  let ownerId: string;
  let ordersStaff: string;
  let verifyStaff: string;
  let balanceStaff: string;
  let listenerStaff: string;
  const pushed = new Set<string>();

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
    process.env['DATABASE_URL'] = urls.appDbUrl;
    process.env['OTP_SECRET'] = 'notifications-e2e-otp-secret-0123456789ab';
    process.env['PLATFORM_DOMAIN'] = 'localhost';
    process.env['RESEND_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
    admin = new pg.Client({ connectionString: urls.adminDbUrl });
    await admin.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useValue(texts.provider)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail.provider)
      .overrideProvider(PUSH_PROVIDER)
      .useValue(pushes)
      .compile();
    ({ app, port } = await listenOn(moduleRef));
    shop = await openShop(port, texts, 'bell');
    ownerId = await ownerRow(shop.tenantId);
    ordersStaff = await staffWith(shop.tenantId, 'Orders', [Permission.OrdersRead]);
    verifyStaff = await staffWith(shop.tenantId, 'Verify', [Permission.PaymentsVerify]);
    balanceStaff = await staffWith(shop.tenantId, 'Money', [Permission.BalanceManage]);
    listenerStaff = await staffWith(shop.tenantId, 'Listener', [Permission.ListenerManage]);
  });

  afterAll(async () => {
    if (!ADMIN_URL) return;
    await app.close();
    await admin.end();
    delete process.env['RESEND_WEBHOOK_SECRET'];
  });

  async function ownerRow(tenantId: string): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.users WHERE tenant_id = $1 AND is_owner',
      [tenantId],
    );
    return rows[0]?.id ?? '';
  }

  /** A staff member holding one role with these permissions. */
  async function staffWith(
    tenantId: string,
    name: string,
    permissions: Permission[],
  ): Promise<string> {
    const role = await admin.query<{ id: string }>(
      'INSERT INTO tenant.roles (tenant_id, name, permissions) VALUES ($1, $2, $3::text[]) RETURNING id',
      [tenantId, `${name} ${randomUUID().slice(0, 6)}`, permissions],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO tenant.users (tenant_id, phone, name, is_owner, active)
       VALUES ($1, $2, $3, false, true) RETURNING id`,
      [tenantId, texts.freshPhone(), name],
    );
    const userId = user.rows[0]?.id ?? '';
    await admin.query(
      'INSERT INTO tenant.user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)',
      [tenantId, userId, role.rows[0]?.id],
    );
    return userId;
  }

  async function recipientsOf(kind: NotificationKind): Promise<string[]> {
    const { rows } = await admin.query<{ user_id: string }>(
      'SELECT user_id FROM tenant.notifications WHERE tenant_id = $1 AND kind = $2 ORDER BY created_at, user_id',
      [shop.tenantId, kind],
    );
    return rows.map((row) => row.user_id);
  }

  async function clearNotifications(): Promise<void> {
    await admin.query('DELETE FROM tenant.notifications WHERE tenant_id = $1', [shop.tenantId]);
  }

  /** Sends every push queued for the shop that this spec hasn't sent yet, as the worker would. */
  async function sendPushes(): Promise<void> {
    const { rows } = await admin.query<{ job: string; payload: NotificationPushJob }>(
      `SELECT id::text AS job, payload FROM control.job_outbox
       WHERE queue_name = 'notification_push' AND payload->>'tenantId' = $1 ORDER BY id`,
      [shop.tenantId],
    );
    for (const row of rows) {
      if (pushed.has(row.job)) continue;
      pushed.add(row.job);
      await app.get(PushSender).send(row.payload);
    }
  }

  function orderNotice(orderNumber: string): Parameters<BellOrderNotifier['orderPlaced']>[0] {
    return {
      tenantId: shop.tenantId,
      orderId: randomUUID(),
      orderNumber,
      source: OrderSource.Storefront,
      customerName: 'Rahima',
      grandTotal: '1250.00',
    };
  }

  it("tells a shopper's order to the owner and to staff holding orders:read, no one else (NTF-01, NTF-03)", async () => {
    await clearNotifications();
    await app.get(BellOrderNotifier).orderPlaced(orderNotice('261107-0001'));
    const told = await recipientsOf(NotificationKind.OrderPlaced);
    expect(told.sort()).toEqual([ownerId, ordersStaff].sort());
  });

  it("shows each reader the bell in their language, newest first, with the badge's count", async () => {
    await app.get(BellOrderNotifier).orderPlaced(orderNotice('261107-0002'));
    const bangla = await shop.get('/notifications');
    expect(bangla.status).toBe(200);
    const page = bangla.body as {
      items: {
        id: string;
        title: string;
        body: string;
        link: string;
        read: boolean;
        kind: string;
      }[];
      unread: number;
    };
    expect(page.unread).toBe(2);
    expect(page.items[0]).toMatchObject({
      kind: 'order_placed',
      title: 'নতুন অর্ডার 261107-0002',
      body: 'Rahima · ৳1250.00 · স্টোরফ্রন্ট',
      read: false,
    });
    expect(page.items[0]?.link).toMatch(/^\/orders\/[0-9a-f-]{36}$/);
    const englishPage = await getIn(shop, '/notifications?limit=1', 'en');
    expect(englishPage.items[0]).toMatchObject({
      title: 'New order 261107-0002',
      body: 'Rahima · 1250.00 TK · storefront',
    });
    expect(englishPage.next).toBe(englishPage.items[0]?.id);
    const older = await getIn(
      shop,
      `/notifications?limit=1&before=${englishPage.next ?? ''}`,
      'en',
    );
    expect(older.items[0]?.title).toBe('New order 261107-0001');
  });

  /** GET in a chosen language. */
  async function getIn(
    client: ShopClient,
    path: string,
    language: 'bn' | 'en',
  ): Promise<{ items: { id: string; title: string; body: string }[]; next: string | null }> {
    const result = await sendExact(port, 'GET', `/api/v1${path}`, undefined, {
      ...client.headers(),
      'accept-language': language,
    });
    expect(result.status).toBe(200);
    return result.body as {
      items: { id: string; title: string; body: string }[];
      next: string | null;
    };
  }

  it("marks the reader's own notifications read, some or all, and never another's", async () => {
    const page = (await shop.get('/notifications')).body as {
      items: { id: string }[];
      unread: number;
    };
    const first = page.items[0]?.id ?? '';
    const some = await shop.post('/notifications/read', { notificationIds: [first] });
    expect(some.status).toBe(200);
    expect(some.body).toEqual({ marked: 1, unread: page.unread - 1 });
    // A staff member's notification, named by the owner, changes nothing.
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.notifications WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
      [shop.tenantId, ordersStaff],
    );
    const theirs = await shop.post('/notifications/read', { notificationIds: [rows[0]?.id] });
    expect(theirs.body).toMatchObject({ marked: 0 });
    const all = await shop.post('/notifications/read', { all: true });
    expect(all.body).toMatchObject({ unread: 0 });
    const both = await shop.post('/notifications/read', { notificationIds: [first], all: true });
    expect(both.status).toBe(400);
    expect((await shop.post('/notifications/read', {})).status).toBe(400);
  });

  it('lets a person switch a kind off for themselves only, and never a money or account kind (NTF-04, D7-40)', async () => {
    await clearNotifications();
    const notifications = app.get(Notifications);
    await notifications.setPreferences(
      shop.tenantId,
      { userId: ordersStaff, permissions: [Permission.OrdersRead] },
      { off: [NotificationKind.OrderPlaced] },
    );
    await app.get(BellOrderNotifier).orderPlaced(orderNotice('261107-0003'));
    expect(await recipientsOf(NotificationKind.OrderPlaced)).toEqual([ownerId]);

    const staffSwitches = await notifications.preferences(shop.tenantId, {
      userId: ordersStaff,
      permissions: [Permission.OrdersRead],
    });
    expect(staffSwitches.map((each) => [each.kind, each.on, each.locked])).toEqual([
      [NotificationKind.OrderPlaced, false, false],
      [NotificationKind.ParcelMoved, true, false],
    ]);

    const owner = await shop.get('/notifications/preferences');
    const kinds = (owner.body as { kinds: { kind: string; on: boolean; locked: boolean }[] }).kinds;
    expect(kinds).toHaveLength(Object.values(NotificationKind).length);
    expect(kinds.find((each) => each.kind === 'payment_to_verify')).toMatchObject({
      on: true,
      locked: true,
    });

    const refused = await shop.put('/notifications/preferences', { off: ['payment_to_verify'] });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toHaveProperty('off.0');
    const saved = await shop.put('/notifications/preferences', {
      off: ['low_stock', 'parcel_moved'],
    });
    expect(saved.status).toBe(200);
    const after = (saved.body as { kinds: { kind: string; on: boolean }[] }).kinds;
    expect(
      after
        .filter((each) => !each.on)
        .map((each) => each.kind)
        .sort(),
    ).toEqual(['low_stock', 'parcel_moved']);
    await shop.put('/notifications/preferences', { off: [] });
  });

  it('tells a payment to verify to its permission even to those who switched other kinds off, the owner always', async () => {
    await clearNotifications();
    await app.get(BellPaymentNotifier).paymentToVerify({
      tenantId: shop.tenantId,
      sessionId: randomUUID(),
      orderNumber: '261107-0004',
      method: PaymentMethod.Bkash,
      amount: '500.00',
      transactionId: 'TRX12345',
    });
    expect((await recipientsOf(NotificationKind.PaymentToVerify)).sort()).toEqual(
      [ownerId, verifyStaff].sort(),
    );
  });

  it("pushes each notice to its person's browsers in their language, opening the shop's page (NTF-02)", async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    const subscribed = await shop.post('/push/subscriptions', { endpoint, keys: browserKeys() });
    expect(subscribed.status).toBe(200);
    expect((await shop.get('/push/key')).body).toEqual({ publicKey: pushes.publicKey });

    await sendPushes();
    const before = pushes.sent.length;
    const notice = orderNotice('261107-0005');
    await app.get(BellOrderNotifier).orderPlaced(notice);
    await sendPushes();
    const mine = pushes.sent.slice(before).filter((each) => each.target.endpoint === endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.message).toMatchObject({
      title: 'নতুন অর্ডার 261107-0005',
      url: `/${shop.slug}/orders/${notice.orderId}`,
    });
    // Its own tag, so a second new order doesn't silently replace the first on the phone.
    expect(mine[0]?.message.tag).toBe(mine[0]?.message.id);
    expect(mine[0]?.options.urgency).toBe('high');

    // The language the owner chose, once they choose.
    await shop.put('/me/language', { language: 'en' });
    await app.get(BellCourierNotifier).parcelMoved({
      tenantId: shop.tenantId,
      orderId: notice.orderId,
      orderNumber: '261107-0005',
      courierKey: CourierKey.Steadfast,
      reading: ParcelReading.Delivered,
    });
    await sendPushes();
    const latest = pushes.sent.filter((each) => each.target.endpoint === endpoint).at(-1);
    expect(latest?.message).toMatchObject({
      title: 'Order 261107-0005: delivered',
      body: 'News from Steadfast.',
    });
    expect(latest?.options.urgency).toBe('normal');
    await shop.put('/me/language', { language: 'bn' });
  });

  it("forgets a browser its push service says is gone, and sends a person's test to theirs", async () => {
    const endpoint = `https://updates.push.services.mozilla.com/wpush/v2/${randomUUID()}`;
    await shop.post('/push/subscriptions', { endpoint, keys: browserKeys() });
    const test = await shop.post('/push/test', {});
    expect(test.status).toBe(200);
    expect((test.body as { sent: number }).sent).toBeGreaterThanOrEqual(2);
    expect(pushes.sent.at(-1)?.message).toMatchObject({ title: 'Lytro পুশ টেস্ট', id: null });

    const { rows } = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tenant.push_subscriptions WHERE tenant_id = $1 AND user_id = $2',
      [shop.tenantId, ownerId],
    );
    pushes.answers = Array<PushOutcome>(rows[0]?.n ?? 0).fill('gone');
    await shop.post('/push/test', {});
    const left = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tenant.push_subscriptions WHERE tenant_id = $1 AND user_id = $2',
      [shop.tenantId, ownerId],
    );
    expect(left.rows[0]?.n).toBe(0);
  });

  it('takes only a push service address, and stops pushing to a browser unsubscribed', async () => {
    const elsewhere = await shop.post('/push/subscriptions', {
      endpoint: 'https://example.com/push/abc',
      keys: browserKeys(),
    });
    expect(elsewhere.status).toBe(400);
    expect(fieldsOf(elsewhere)).toHaveProperty('endpoint');
    const plain = await shop.post('/push/subscriptions', {
      endpoint: 'http://fcm.googleapis.com/fcm/send/abc',
      keys: browserKeys(),
    });
    expect(plain.status).toBe(400);

    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await shop.post('/push/subscriptions', { endpoint, keys: browserKeys() });
    const removed = await sendExact(
      port,
      'DELETE',
      '/api/v1/push/subscriptions',
      { endpoint },
      shop.headers(),
    );
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ subscribed: false });
    expect((await shop.post('/push/subscriptions/check', { endpoint })).body).toEqual({
      subscribed: false,
    });
    const before = pushes.sent.length;
    await shop.post('/push/test', {});
    expect(pushes.sent.slice(before).some((each) => each.target.endpoint === endpoint)).toBe(false);
  });

  it('says whether this browser is subscribed for this person, not whoever else used it (NTF-02)', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    expect((await shop.post('/push/subscriptions/check', { endpoint })).body).toEqual({
      subscribed: false,
    });
    await shop.post('/push/subscriptions', { endpoint, keys: browserKeys() });
    expect((await shop.post('/push/subscriptions/check', { endpoint })).body).toEqual({
      subscribed: true,
    });
  });

  it('the push service being away counts for nothing against a browser; only its own refusals do (NTF-02)', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await shop.post('/push/subscriptions', { endpoint, keys: browserKeys() });
    const failuresOf = async (): Promise<number | undefined> =>
      (
        await admin.query<{ failures: number }>(
          'SELECT failures FROM tenant.push_subscriptions WHERE tenant_id = $1 AND endpoint = $2',
          [shop.tenantId, endpoint],
        )
      ).rows[0]?.failures;
    const threw = vi
      .spyOn(pushes, 'send')
      .mockImplementation(() => Promise.reject(new Error('circuit open')));
    try {
      for (let tries = 0; tries < 12; tries += 1) await shop.post('/push/test', {});
      expect(await failuresOf()).toBe(0);
      threw.mockImplementation(() => Promise.resolve('refused'));
      await shop.post('/push/test', {});
      expect(await failuresOf()).toBe(1);
    } finally {
      threw.mockRestore();
    }
  });

  it('tells low balance to the owner and the staff who can top up, by bell (NTF-05, D7-42)', async () => {
    await clearNotifications();
    await app
      .get(TransactionRunner)
      .run(app.get(DatabaseService).handle.db, (tx) =>
        app
          .get<LowBalanceNotifier>(LOW_BALANCE_NOTIFIER)
          .notifyCrossed(tx, shop.tenantId, 10_000n, '80.00'),
      );
    expect((await recipientsOf(NotificationKind.LowBalance)).sort()).toEqual(
      [ownerId, balanceStaff].sort(),
    );
    const page = (await shop.get('/notifications')).body as {
      items: { title: string; link: string }[];
    };
    expect(page.items[0]).toMatchObject({ title: 'আপনার ব্যালেন্স কম', link: '/balance' });
  });

  it("tells the shop's own listener phone to those who manage the listener", async () => {
    await clearNotifications();
    await app.get<ListenerNotifier>(LISTENER_NOTIFIER).deviceAutoRevoked({
      tenantId: shop.tenantId,
      deviceId: randomUUID(),
      name: 'Shop phone',
      flags: 3,
    });
    expect((await recipientsOf(NotificationKind.ListenerPhone)).sort()).toEqual(
      [ownerId, listenerStaff].sort(),
    );
  });

  it('tells the owner in the bell when their email bounces (NTF-06, D7-38)', async () => {
    await clearNotifications();
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    await shop.post('/me/identities/code', { kind: 'email', value: email });
    await shop.post('/me/identities/verify', {
      kind: 'email',
      value: email,
      code: mail.codeFor(email),
    });
    const body = JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: randomUUID(),
        to: [email],
        bounce: { type: 'Permanent', message: 'No mailbox.' },
      },
    });
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', Buffer.from(WEBHOOK_SECRET.slice(6), 'base64'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    const answered = await postJson(port, '/webhooks/email/resend', JSON.parse(body) as unknown, {
      host: 'localhost',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    });
    expect(answered.status).toBe(200);
    expect(await recipientsOf(NotificationKind.EmailBounced)).toEqual([ownerId]);
    // Resend trying again, or another email bouncing, tells the owner nothing new.
    const repeat = await postJson(port, '/webhooks/email/resend', JSON.parse(body) as unknown, {
      host: 'localhost',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    });
    expect(repeat.status).toBe(200);
    expect(await recipientsOf(NotificationKind.EmailBounced)).toEqual([ownerId]);
    const page = (await shop.get('/notifications')).body as {
      items: { title: string; link: string }[];
    };
    expect(page.items[0]).toMatchObject({
      title: 'আপনার ইমেইলে মেইল পৌঁছাচ্ছে না',
      link: '/account',
    });
  });

  it('keeps a notification 30 days, then the nightly clean-up deletes it (D7-39)', async () => {
    await clearNotifications();
    const words = JSON.stringify({ bn: { title: 'a', body: 'b' }, en: { title: 'a', body: 'b' } });
    for (const days of [31, 29]) {
      await admin.query(
        `INSERT INTO tenant.notifications (tenant_id, user_id, kind, words, created_at)
         VALUES ($1, $2, 'low_stock', $3::jsonb, now() - make_interval(days => $4))`,
        [shop.tenantId, ownerId, words, days],
      );
    }
    expect(await app.get(NotificationPurge).run(new Date())).toBeGreaterThanOrEqual(1);
    const { rows } = await admin.query<{ days: number }>(
      `SELECT extract(day FROM now() - created_at)::int AS days FROM tenant.notifications WHERE tenant_id = $1`,
      [shop.tenantId],
    );
    expect(rows.map((row) => row.days)).toEqual([29]);
  });

  it("refuses the bell's requests it can't read", async () => {
    const wrong = await shop.get('/notifications?limit=500');
    expect(wrong.status).toBe(400);
    expect(errorOf(wrong).code).toBe('validation_error');
  });
});
