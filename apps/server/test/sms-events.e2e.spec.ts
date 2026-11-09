import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SmsEvent, takaFigure } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ShopStorefrontService } from '../src/modules/balance/services/shop-storefront.service';
import type { SmsEventJob } from '../src/modules/sms-events/services/sms-event-queue';
import {
  SmsEventSender,
  SmsEventSendFailed,
} from '../src/modules/sms-events/services/sms-event-sender';
import { DomainService } from '../src/modules/domains/services/domain.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { postJson } from './support/http';
import { prepareTestDatabase, seedBalance } from './support/database';
import { PrepaidPath, type PrepaidShop } from './support/prepaid-path';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// SMS-01 to SMS-19 (Phase 7 Slice 7.2, read agreed 2026-11-06), over real HTTP and the real database: a shop's SMS
// events -- each queued where its order changed, then worded from the shop's template after its SMS name, charged from
// the balance at the SMS rate (never below zero, D7-23), given back when the send fails, refused at the month's cap --
// and the settings, log and report a shop reads them through. The jobs wait in the outbox in tests (the relay doesn't
// run), so each is sent here by the sender itself. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_sms_events_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STOREFRONT_SECRET = 'sms-events-e2e-storefront-secret-0123456789abcdef';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let path: PrepaidPath;
const texts = new SmsCapture();
const ran = new Set<string>();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'sms-events-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(GatewayReconcileTickWorker)
    .useValue({})
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

interface LogRow {
  kind: string;
  status: string;
  cost: string;
  units: number;
  blocked_reason: string | null;
  order_id: string | null;
  body: string | null;
  to_phone: string;
}

/** The order SMS jobs queued for a shop that this spec hasn't sent yet, oldest first. */
async function queued(tenantId: string): Promise<SmsEventJob[]> {
  const { rows } = await admin.query<{ job: string; payload: SmsEventJob }>(
    `SELECT id::text AS job, payload FROM control.job_outbox
     WHERE queue_name = 'order_sms' AND payload->>'tenantId' = $1 ORDER BY id`,
    [tenantId],
  );
  return rows.filter((row) => !ran.has(row.job)).map((row) => row.payload);
}

/** Sends every job queued for the shop, as the worker would. */
async function sendQueued(tenantId: string): Promise<SmsEventJob[]> {
  const { rows } = await admin.query<{ job: string; payload: SmsEventJob }>(
    `SELECT id::text AS job, payload FROM control.job_outbox
     WHERE queue_name = 'order_sms' AND payload->>'tenantId' = $1 ORDER BY id`,
    [tenantId],
  );
  const jobs: SmsEventJob[] = [];
  for (const row of rows) {
    if (ran.has(row.job)) continue;
    ran.add(row.job);
    jobs.push(row.payload);
    await app.get(SmsEventSender).send(row.payload);
  }
  return jobs;
}

async function smsLog(tenantId: string): Promise<LogRow[]> {
  const { rows } = await admin.query<LogRow>(
    `SELECT kind, status, cost::text, units, blocked_reason, order_id, body, to_phone
     FROM tenant.sms_log WHERE tenant_id = $1 ORDER BY id`,
    [tenantId],
  );
  return rows;
}

async function balanceOf(tenantId: string): Promise<string> {
  const { rows } = await admin.query<{ balance: string }>(
    'SELECT coalesce(sum(amount), 0)::numeric(12,2)::text AS balance FROM tenant.balance_ledger WHERE tenant_id = $1',
    [tenantId],
  );
  return rows[0]?.balance ?? '0.00';
}

async function ownerPhone(tenantId: string): Promise<string> {
  const { rows } = await admin.query<{ phone: string }>(
    'SELECT phone FROM tenant.users WHERE tenant_id = $1 AND is_owner',
    [tenantId],
  );
  return rows[0]?.phone ?? '';
}

async function trackingIdOf(orderId: string): Promise<string> {
  const { rows } = await admin.query<{ tracking_id: string }>(
    'SELECT tracking_id FROM tenant.orders WHERE id = $1',
    [orderId],
  );
  return rows[0]?.tracking_id ?? '';
}

/** A product with no advance, so its orders may ship at once. */
async function plainVariant(shop: ShopClient): Promise<string> {
  const made = await shop.post('/products', {
    name: `Lamp ${randomUUID().slice(0, 6)}`,
    basePrice: 500,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

interface StaffOrder {
  id: string;
  orderNumber: string;
  /** The grand total as an SMS writes it. */
  total: string;
  phone: string;
}

/** An order staff enter by hand, for a delivery unless told otherwise. */
async function staffOrder(
  setup: PrepaidShop,
  variantId: string,
  more: Record<string, unknown> = {},
): Promise<StaffOrder> {
  const phone = texts.freshPhone();
  const body =
    more['fulfilmentType'] === 'takeaway'
      ? { customerName: 'Karim Mia', phone, items: [{ variantId, quantity: 1 }], ...more }
      : {
          customerName: 'Rahima Akter',
          phone,
          locationId: setup.locationId,
          deliveryAddress: 'House 12, Road 3',
          items: [{ variantId, quantity: 1 }],
          ...more,
        };
  const made = await postJson(
    port,
    '/orders',
    body,
    setup.shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const order = made.body as { id: string; orderNumber: string; grandTotal: string };
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    total: takaFigure(order.grandTotal),
    phone,
  };
}

function lastTo(phone: string): string {
  return [...texts.sent].reverse().find((sms) => sms.toPhone === phone)?.body ?? '';
}

describeIfDatabase(
  'SMS-02, SMS-03, SMS-10, SMS-12, SMS-16, SMS-19: a shop sees and changes its SMS events',
  () => {
    it("a new shop has SMS-03's defaults, in Bangla, each priced per order until it has any", async () => {
      const shop = await openShop(port, texts, 'smsset');
      const read = await shop.get('/sms/settings');
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      const view = read.body as {
        events: {
          event: string;
          recipient: string;
          on: boolean;
          edited: boolean;
          template: string;
          sample: string;
          units: number;
          estimate: { basis: string; cost: string };
        }[];
        essentials: { kind: string; words: string; payer: string }[];
        ownerPhone: string | null;
        smsName: string;
        usesShopName: boolean;
        monthlySpendCap: string | null;
        unitSize: number;
        rate: string;
      };
      expect(view.events.map((row) => [row.event, row.recipient, row.on])).toEqual([
        ['order_placed', 'shopper', true],
        ['payment_verified', 'shopper', true],
        ['order_shipped', 'shopper', true],
        ['order_delivered', 'shopper', false],
        ['order_cancelled', 'shopper', true],
        ['new_order_alert', 'owner', false],
        ['payment_to_verify', 'owner', false],
      ]);
      // Slice 7.7: each essential SMS as it reads, with a sample code or the shop's address, and who pays for it.
      expect(view.essentials.map((row) => [row.kind, row.payer])).toEqual([
        ['shopper_code', 'balance'],
        ['staff_reset_code', 'free_then_balance'],
        ['shop_ready', 'free'],
      ]);
      expect(view.essentials[0]?.words).toBe(
        `Shop ${shop.slug}-এ সাইন আপের জন্য OTP হচ্ছে 123456। কারো সাথে শেয়ার করবেন না।`,
      );
      expect(view.essentials[1]?.words).toContain('পাসওয়ার্ড রিসেটের জন্য OTP হচ্ছে 123456');
      expect(view.essentials[2]?.words).toBe(`Your shop is ready: http://${shop.slug}.localhost`);
      // The owner signed up by phone: their own SMS go to it.
      expect(view.ownerPhone).toMatch(/^01\d{9}$/);
      // Slice 7.7: the cycle the spend and its cap count over.
      const cycle = read.body as { cycleStart: string; cycleEnd: string };
      expect(new Date(cycle.cycleEnd).getTime()).toBeGreaterThan(
        new Date(cycle.cycleStart).getTime(),
      );
      expect(new Date(cycle.cycleStart).getTime()).toBeLessThanOrEqual(Date.now());
      expect(view).toMatchObject({
        smsName: `Shop ${shop.slug}`,
        usesShopName: true,
        monthlySpendCap: null,
        unitSize: 67,
      });
      expect(Number(view.rate)).toBe(0.55);
      const placed = view.events[0];
      expect(placed?.edited).toBe(false);
      expect(placed?.template).toBe('অর্ডার {order_number} পেয়েছি, মোট ৳{amount}। ধন্যবাদ!');
      // SMS-10: counted with the shop's real name in front, and an order number of its real length.
      expect(placed?.sample).toBe(
        `Shop ${shop.slug}: অর্ডার 261106-0017 পেয়েছি, মোট ৳1,250। ধন্যবাদ!`,
      );
      expect(placed?.estimate).toEqual({
        basis: 'per_order',
        cost: placed?.units === 1 ? '0.55' : '1.10',
      });
      const shipped = view.events.find((row) => row.event === 'order_shipped');
      expect(shipped?.sample).toContain(`http://${shop.slug}.localhost/track/AB3XK9QZ`);
      expect(shipped?.units).toBe(2);

      // SMS-10: a longer name is counted, and the sample carries the shop's own domain as the SMS will.
      const shorter = await shop.patch('/sms/settings', { smsName: 'Nodi' });
      expect(shorter.status, JSON.stringify(shorter.body)).toBe(200);
      const short = (await shop.get('/sms/settings')).body as typeof view;
      const longer = await shop.patch('/sms/settings', { smsName: 'N'.repeat(40) });
      expect(longer.status, JSON.stringify(longer.body)).toBe(200);
      const domains = vi
        .spyOn(app.get(DomainService), 'servingHost')
        .mockResolvedValue('shop.example-long-domain.com.bd');
      try {
        const named = (await shop.get('/sms/settings')).body as typeof view;
        expect(named.events[0]?.units).toBeGreaterThan(short.events[0]?.units ?? 0);
        expect(named.events.find((row) => row.event === 'order_shipped')?.sample).toContain(
          'shop.example-long-domain.com.bd/',
        );
      } finally {
        domains.mockRestore();
      }
    });

    it('a template keeps {order_number} and names only its own variables; a cap is at least 1 TK', async () => {
      const shop = await openShop(port, texts, 'smsref');
      const missing = await shop.patch('/sms/settings', {
        templates: { order_placed: 'আপনার অর্ডার পেয়েছি।' },
      });
      expect(missing.status).toBe(400);
      expect(fieldsOf(missing)).toEqual({ 'templates.order_placed': 'missing_variable' });
      const unknown = await shop.patch('/sms/settings', {
        templates: { order_cancelled: 'অর্ডার {order_number} ক্যানসেল, ৳{amount} ফেরত।' },
      });
      expect(fieldsOf(unknown)).toEqual({ 'templates.order_cancelled': 'unknown_variable' });
      expect(fieldsOf(await shop.patch('/sms/settings', { monthlySpendCap: 0.5 }))).toEqual({
        monthlySpendCap: 'too_small',
      });
      const nothing = await shop.patch('/sms/settings', {});
      expect(nothing.status).toBe(400);
      expect(errorOf(nothing).code).toBe('validation_error');
    });

    it("changes only what it names, and a reset follows the platform's default again; another shop is untouched", async () => {
      const shop = await openShop(port, texts, 'smschg');
      const other = await openShop(port, texts, 'smsoth');
      const changed = await shop.patch('/sms/settings', {
        events: { order_delivered: true },
        templates: { order_placed: '{customer_name}, অর্ডার {order_number} পেয়েছি।' },
        smsName: 'Nodi',
        monthlySpendCap: 50,
      });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      const view = changed.body as {
        events: { event: string; on: boolean; edited: boolean; template: string }[];
        smsName: string;
        usesShopName: boolean;
        monthlySpendCap: string;
      };
      expect(view).toMatchObject({
        smsName: 'Nodi',
        usesShopName: false,
        monthlySpendCap: '50.00',
      });
      expect(view.events.find((row) => row.event === 'order_delivered')?.on).toBe(true);
      expect(view.events.find((row) => row.event === 'order_placed')).toMatchObject({
        edited: true,
        template: '{customer_name}, অর্ডার {order_number} পেয়েছি।',
      });
      // A second change to another event keeps the first.
      await shop.patch('/sms/settings', { events: { new_order_alert: true } });
      const reset = await shop.post('/sms/settings/templates/order_placed/reset', {});
      expect(reset.status, JSON.stringify(reset.body)).toBe(200);
      const after = reset.body as typeof view;
      expect(after.events.find((row) => row.event === 'order_placed')).toMatchObject({
        edited: false,
        template: 'অর্ডার {order_number} পেয়েছি, মোট ৳{amount}। ধন্যবাদ!',
      });
      expect(after.events.find((row) => row.event === 'order_delivered')?.on).toBe(true);
      expect(after.events.find((row) => row.event === 'new_order_alert')?.on).toBe(true);
      expect((await shop.patch('/sms/settings', { smsName: null })).body).toMatchObject({
        smsName: `Shop ${shop.slug}`,
        usesShopName: true,
      });
      expect((await shop.post('/sms/settings/templates/nonsense/reset', {})).status).toBe(404);
      const untouched = (await other.get('/sms/settings')).body as typeof view;
      expect(untouched).toMatchObject({ usesShopName: true, monthlySpendCap: null });
      expect(untouched.events.find((row) => row.event === 'order_delivered')?.on).toBe(false);
    });
  },
);

describeIfDatabase(
  'SMS-01, D7-23: each event sends what it should, charged from the balance',
  () => {
    it("a storefront order tells the shopper, charged at the SMS rate; the owner's alert only once it's on", async () => {
      const setup = await path.shop('smsplace');
      const tenantId = setup.shop.tenantId;
      const owner = await ownerPhone(tenantId);
      // The owner's phone already had its sign-up code and the shop-ready SMS.
      const ownerHad = texts.countFor(owner);
      const before = await balanceOf(tenantId);
      const first = await path.landingOrder(setup);
      const jobs = await sendQueued(tenantId);
      expect(jobs.map((job) => job.event)).toEqual([SmsEvent.OrderPlaced, SmsEvent.NewOrderAlert]);
      const log = await smsLog(tenantId);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        kind: 'order_placed',
        status: 'sent',
        order_id: first.orderId,
        blocked_reason: null,
      });
      const body = log[0]?.body ?? '';
      expect(body).toMatch(
        new RegExp(
          `^Shop ${setup.shop.slug}: অর্ডার \\d{6}-\\d{4} পেয়েছি, মোট ৳1,\\d{3}। ধন্যবাদ!$`,
        ),
      );
      expect(lastTo(log[0]?.to_phone ?? '')).toBe(body);
      expect(texts.countFor(owner)).toBe(ownerHad);
      const cost = Number(log[0]?.cost);
      expect(cost).toBeCloseTo(0.55 * (log[0]?.units ?? 0), 2);
      expect(Number(await balanceOf(tenantId))).toBeCloseTo(Number(before) - cost, 2);

      await setup.shop.patch('/sms/settings', { events: { new_order_alert: true } });
      await path.landingOrder(setup);
      await sendQueued(tenantId);
      expect(lastTo(owner)).toMatch(
        new RegExp(`^Shop ${setup.shop.slug}: নতুন অর্ডার \\d{6}-\\d{4}, মোট ৳1,\\d{3}।$`),
      );
    });

    it('an order staff enter sends the shopper the same, never the owner an alert; takeaway sends nothing', async () => {
      const setup = await path.shop('smsstaff');
      const tenantId = setup.shop.tenantId;
      const owner = await ownerPhone(tenantId);
      const ownerHad = texts.countFor(owner);
      await setup.shop.patch('/sms/settings', { events: { new_order_alert: true } });
      const variant = await plainVariant(setup.shop);
      const delivery = await staffOrder(setup, variant);
      const takeaway = await staffOrder(setup, variant, { fulfilmentType: 'takeaway' });
      await sendQueued(tenantId);
      expect(lastTo(delivery.phone)).toBe(
        `Shop ${setup.shop.slug}: অর্ডার ${delivery.orderNumber} পেয়েছি, মোট ৳${delivery.total}। ধন্যবাদ!`,
      );
      expect(texts.countFor(takeaway.phone)).toBe(0);
      expect(texts.countFor(owner)).toBe(ownerHad);
      expect((await smsLog(tenantId)).map((row) => row.kind)).toEqual(['order_placed']);
    });

    it('a payment staff record tells the shopper its own amount; shipped links the tracking page; cancelled is said', async () => {
      const setup = await path.shop('smsflow');
      const tenantId = setup.shop.tenantId;
      const variant = await plainVariant(setup.shop);
      const order = await staffOrder(setup, variant);
      const paid = await setup.shop.post(`/orders/${order.id}/payments`, {
        method: 'bkash',
        amount: 200,
        senderNumber: '01811000002',
        transactionId: `TX${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(201);
      await sendQueued(tenantId);
      expect(lastTo(order.phone)).toBe(
        `Shop ${setup.shop.slug}: অর্ডার ${order.orderNumber}-এর ৳200 পেমেন্ট পেয়েছি।`,
      );
      const sent = await setup.shop.post(`/orders/${order.id}/ship`, {
        courierName: 'Steadfast',
        trackingCode: 'SF-1001',
      });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      await sendQueued(tenantId);
      const trackingId = await trackingIdOf(order.id);
      expect(lastTo(order.phone)).toBe(
        `Shop ${setup.shop.slug}: অর্ডার ${order.orderNumber} পাঠানো হয়েছে: http://${setup.shop.slug}.localhost/track/${trackingId}`,
      );
      // Delivered is off by default: nothing more.
      expect((await setup.shop.post(`/orders/${order.id}/deliver`, {})).status).toBe(200);
      await sendQueued(tenantId);
      expect(texts.countFor(order.phone)).toBe(3);

      const second = await staffOrder(setup, variant);
      const cancelled = await setup.shop.post(`/orders/${second.id}/cancel`, {
        reason: 'customer_cancelled',
      });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      await sendQueued(tenantId);
      expect(lastTo(second.phone)).toBe(
        `Shop ${setup.shop.slug}: অর্ডার ${second.orderNumber} ক্যানসেল করা হয়েছে।`,
      );
      expect((await smsLog(tenantId)).map((row) => row.kind)).toEqual([
        'order_placed',
        'payment_verified',
        'order_shipped',
        'order_placed',
        'order_cancelled',
      ]);
    });

    it("with the storefront off, shipped sends the courier's own link, or its code; delivered goes once it's on", async () => {
      const setup = await path.shop('smsship');
      const tenantId = setup.shop.tenantId;
      await app.get(ShopStorefrontService).set(tenantId, false);
      await setup.shop.patch('/sms/settings', {
        events: { order_delivered: true },
        smsName: 'Nodi',
      });
      const variant = await plainVariant(setup.shop);
      const linked = await staffOrder(setup, variant);
      await setup.shop.post(`/orders/${linked.id}/ship`, {
        courierName: 'Steadfast',
        trackingLink: 'https://steadfast.com.bd/t/SF1002',
      });
      const coded = await staffOrder(setup, variant);
      await setup.shop.post(`/orders/${coded.id}/ship`, {
        courierName: 'Pathao',
        trackingCode: 'PT-77',
      });
      await sendQueued(tenantId);
      expect(lastTo(linked.phone)).toBe(
        `Nodi: অর্ডার ${linked.orderNumber} পাঠানো হয়েছে: https://steadfast.com.bd/t/SF1002`,
      );
      expect(lastTo(coded.phone)).toBe(`Nodi: অর্ডার ${coded.orderNumber} পাঠানো হয়েছে: PT-77`);
      await setup.shop.post(`/orders/${coded.id}/deliver`, {});
      await sendQueued(tenantId);
      expect(lastTo(coded.phone)).toBe(
        `Nodi: অর্ডার ${coded.orderNumber} ডেলিভারি হয়েছে। ধন্যবাদ!`,
      );
    });

    it("a payment the shopper typed tells the owner to check it, at the moment staff are told, once it's on", async () => {
      const setup = await path.shop('smsverify');
      const tenantId = setup.shop.tenantId;
      const owner = await ownerPhone(tenantId);
      await setup.shop.patch('/sms/settings', { events: { payment_to_verify: true } });
      const placed = await path.landingOrder(setup);
      const typed = await path.typeId(
        placed.ref,
        `TX${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      );
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      await sendQueued(tenantId);
      expect(lastTo(owner)).toMatch(
        new RegExp(`^Shop ${setup.shop.slug}: অর্ডার \\d{6}-\\d{4}-এর ৳300 পেমেন্ট ভেরিফাই করুন।$`),
      );
    });
  },
);

describeIfDatabase('SMS-06, SMS-07, SMS-08, SMS-13, SMS-15: refused, failed and capped SMS', () => {
  it('with nothing to pay, nothing is sent or charged, and the log says why; the order is untouched', async () => {
    const setup = await path.shop('smspoor');
    const tenantId = setup.shop.tenantId;
    await admin.query(
      `INSERT INTO tenant.balance_ledger (tenant_id, type, amount, reference)
       VALUES ($1, 'adjustment', -(SELECT sum(amount) FROM tenant.balance_ledger WHERE tenant_id = $1), '{"test": "empty"}')`,
      [tenantId],
    );
    const variant = await plainVariant(setup.shop);
    const order = await staffOrder(setup, variant);
    await sendQueued(tenantId);
    expect(texts.countFor(order.phone)).toBe(0);
    expect(await smsLog(tenantId)).toMatchObject([
      {
        kind: 'order_placed',
        status: 'blocked',
        blocked_reason: 'insufficient_balance',
        cost: '0.00',
      },
    ]);
    expect(await balanceOf(tenantId)).toBe('0.00');
  });

  it("a lapsed shop's frozen balance refuses it", async () => {
    const setup = await path.shop('smsfrozen');
    const tenantId = setup.shop.tenantId;
    const variant = await plainVariant(setup.shop);
    const order = await staffOrder(setup, variant);
    await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [tenantId]);
    await sendQueued(tenantId);
    expect(texts.countFor(order.phone)).toBe(0);
    expect((await smsLog(tenantId))[0]).toMatchObject({
      status: 'blocked',
      blocked_reason: 'balance_frozen',
    });
  });

  it('SMS-08: a send that fails costs nothing, is logged, and is tried again; the next try charges once', async () => {
    const setup = await path.shop('smsfail');
    const tenantId = setup.shop.tenantId;
    const variant = await plainVariant(setup.shop);
    const before = await balanceOf(tenantId);
    const order = await staffOrder(setup, variant);
    const [job] = await queued(tenantId);
    texts.down = true;
    try {
      await expect(app.get(SmsEventSender).send(job as SmsEventJob)).rejects.toBeInstanceOf(
        SmsEventSendFailed,
      );
    } finally {
      texts.down = false;
    }
    expect(await balanceOf(tenantId)).toBe(before);
    expect((await smsLog(tenantId)).map((row) => [row.status, row.cost])).toEqual([
      ['failed', '0.00'],
    ]);
    await sendQueued(tenantId);
    expect(texts.countFor(order.phone)).toBe(1);
    const log = await smsLog(tenantId);
    expect(log.map((row) => row.status)).toEqual(['failed', 'sent']);
    expect(Number(await balanceOf(tenantId))).toBeCloseTo(Number(before) - Number(log[1]?.cost), 2);
  });

  it('criterion 2: an order with two SMS retries only the one that failed, so neither goes or is charged twice', async () => {
    const setup = await path.shop('smsretry');
    const tenantId = setup.shop.tenantId;
    const owner = await ownerPhone(tenantId);
    const on = await setup.shop.patch('/sms/settings', {
      smsName: 'Nodi',
      events: { [SmsEvent.NewOrderAlert]: true },
    });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    const ownerHad = texts.countFor(owner);
    const before = Number(await balanceOf(tenantId));
    await path.landingOrder(setup);
    const jobs = await queued(tenantId);
    expect(jobs.map((job) => job.event)).toEqual([SmsEvent.OrderPlaced, SmsEvent.NewOrderAlert]);
    const sender = app.get(SmsEventSender);
    await sender.send(jobs[0] as SmsEventJob);
    texts.down = true;
    try {
      await expect(sender.send(jobs[1] as SmsEventJob)).rejects.toBeInstanceOf(SmsEventSendFailed);
    } finally {
      texts.down = false;
    }
    await sender.send(jobs[1] as SmsEventJob);
    const sent = (await smsLog(tenantId)).filter((row) => row.status === 'sent');
    const shopper = sent.find((row) => row.kind === 'order_placed')?.to_phone as string;
    expect(texts.countFor(shopper)).toBe(1);
    expect(texts.countFor(owner)).toBe(ownerHad + 1);
    expect(sent.map((row) => row.kind).sort()).toEqual(['new_order_alert', 'order_placed']);
    const spent = sent.reduce((sum, row) => sum + Number(row.cost), 0);
    expect(Number(await balanceOf(tenantId))).toBeCloseTo(before - spent, 2);
  });

  it('SMS-13: at the cap the order SMS stop, with one warning at 80%', async () => {
    const setup = await path.shop('smscap');
    const tenantId = setup.shop.tenantId;
    const variant = await plainVariant(setup.shop);
    // Each "placed" here is one unit, 0.55 TK: two reach 1.10, the third would pass it.
    const capped = await setup.shop.patch('/sms/settings', {
      smsName: 'Nodi',
      monthlySpendCap: 1.1,
    });
    expect(capped.status, JSON.stringify(capped.body)).toBe(200);
    const orders = [
      await staffOrder(setup, variant),
      await staffOrder(setup, variant),
      await staffOrder(setup, variant),
    ];
    await sendQueued(tenantId);
    expect(orders.map((order) => texts.countFor(order.phone))).toEqual([1, 1, 0]);
    expect((await smsLog(tenantId)).map((row) => [row.status, row.blocked_reason])).toEqual([
      ['sent', null],
      ['sent', null],
      ['blocked', 'spend_cap'],
    ]);
    const { rows } = await admin.query<{ level: number }>(
      `SELECT (payload->>'level')::int AS level FROM control.job_outbox
       WHERE queue_name = 'usage_notice' AND payload->>'tenantId' = $1 AND payload->>'metric' = 'sms_spend'`,
      [tenantId],
    );
    expect(rows).toEqual([{ level: 80 }]);
    expect((await setup.shop.get('/sms/settings')).body).toMatchObject({ spentThisMonth: '1.10' });
  });

  it('SMS-15: a trial shop sends them too, charged the same', async () => {
    const shop = await openShop(port, texts, 'smstrial');
    await seedBalance(admin, shop.tenantId, '20.00');
    const variant = await plainVariant(shop);
    const { zillas } = (await shop.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    const locationId =
      zillas.find((row) => row.nameEn === 'Dhaka')?.thanas.find((row) => row.nameEn === 'Mirpur')
        ?.id ?? 0;
    const order = await staffOrder(
      { shop, productId: '', variantId: variant, locationId, accountId: '' },
      variant,
    );
    await sendQueued(shop.tenantId);
    expect(texts.countFor(order.phone)).toBe(1);
    const log = await smsLog(shop.tenantId);
    expect(log[0]).toMatchObject({ status: 'sent', kind: 'order_placed' });
    expect(Number(await balanceOf(shop.tenantId))).toBeCloseTo(20 - Number(log[0]?.cost), 2);

    // SMS-12: once there are orders, the estimate is the last 30 days' count at today's rate.
    const view = (await shop.get('/sms/settings')).body as {
      events: { event: string; units: number; estimate: Record<string, unknown> }[];
    };
    const placed = view.events[0];
    expect(placed?.estimate).toEqual({
      basis: 'last_30_days',
      count: 1,
      cost: (0.55 * (placed?.units ?? 0)).toFixed(2),
    });
  });

  it('I18N-03: a template the shop rewrote in English goes out as written, untranslated', async () => {
    const setup = await path.shop('smsowntext');
    const tenantId = setup.shop.tenantId;
    const saved = await setup.shop.patch('/sms/settings', {
      smsName: 'Nodi',
      templates: { [SmsEvent.OrderPlaced]: 'Got order {order_number}, thanks!' },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const variant = await plainVariant(setup.shop);
    await staffOrder(setup, variant);
    await sendQueued(tenantId);
    const [row] = await smsLog(tenantId);
    expect(row?.body).toMatch(/^Nodi: Got order \S+, thanks!$/);
  });
});

describeIfDatabase('SMS-14, SMS-17: what a shop sees of its SMS', () => {
  it("the report's cost equals the ledger's SMS charges less what was given back; the log is the shop's own", async () => {
    const setup = await path.shop('smsreport');
    const tenantId = setup.shop.tenantId;
    const other = await path.shop('smsreportb');
    const variant = await plainVariant(setup.shop);
    const first = await staffOrder(setup, variant);
    await staffOrder(setup, variant);
    const [job] = await queued(tenantId);
    texts.down = true;
    await app
      .get(SmsEventSender)
      .send(job as SmsEventJob)
      .catch(() => undefined);
    texts.down = false;
    await sendQueued(tenantId);

    const report = await setup.shop.get('/sms/report');
    expect(report.status, JSON.stringify(report.body)).toBe(200);
    const days = (
      report.body as { days: { kind: string; sent: number; failed: number; cost: string }[] }
    ).days;
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ kind: 'order_placed', sent: 2, failed: 1 });
    const { rows } = await admin.query<{ net: string }>(
      `SELECT (-sum(amount))::numeric(12,2)::text AS net FROM tenant.balance_ledger
       WHERE tenant_id = $1 AND (type = 'sms' OR (type = 'reversal' AND reference->>'reason' = 'sms_not_sent'))`,
      [tenantId],
    );
    expect(days[0]?.cost).toBe(rows[0]?.net);

    const log = await setup.shop.get('/sms/log?limit=2');
    expect(log.status, JSON.stringify(log.body)).toBe(200);
    const page = (log.body as { sms: { id: number; status: string; body: string | null }[] }).sms;
    expect(page.map((row) => row.status)).toEqual(['sent', 'sent']);
    const rest = (await setup.shop.get(`/sms/log?before=${String(page[1]?.id ?? 0)}`)).body as {
      sms: { status: string }[];
    };
    expect(rest.sms.map((row) => row.status)).toEqual(['failed']);
    const own = (await setup.shop.get(`/sms/log?orderId=${first.id}`)).body as {
      sms: { orderId: string | null; orderNumber: string | null }[];
    };
    expect(own.sms.length).toBeGreaterThan(0);
    // Slice 7.7: each row carries its order's number for the link.
    const numbered = await admin.query<{ order_number: string }>(
      'SELECT order_number FROM tenant.orders WHERE id = $1',
      [first.id],
    );
    expect(own.sms.every((row) => row.orderNumber === numbered.rows[0]?.order_number)).toBe(true);
    expect((await other.shop.get(`/sms/log?orderId=${first.id}`)).body).toEqual({ sms: [] });
    expect(((await other.shop.get('/sms/report')).body as { days: unknown[] }).days).toEqual([]);
  });
});
