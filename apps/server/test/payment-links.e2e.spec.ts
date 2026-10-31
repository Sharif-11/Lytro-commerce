import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentPageReportStatus, PlatformSettingKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { PaymentPageOversight } from '../src/modules/payment-sessions/services/payment-page-oversight';
import { PaymentSessionExpiry } from '../src/modules/payment-sessions/services/payment-session-expiry';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { RequestQuota } from '../src/modules/public-api/services/request-quota';
import { API_CLOCK } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.2b, read agreed 2026-10-31: staff make a payment link for an order, open 24 hours, for the advance
// still owed, else what is due (PAY-24); the shop's shoppers open payment sessions within a per-minute flood guard
// (RTE-08); a shopper may report a payment page (TVR-02), and Lytro suspends a shop's page at once or dismisses the
// report (TVR-03, ADM-12). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_links_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBSITE = 'https://myshop.com';
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
const OPERATOR_ID = randomUUID();
// The public API keeps a shop's row a few seconds (api-key-authenticator.ts); a test moves its clock past that.
const PAST_SHOP_LOOKUP_MS = 6_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockOffsetMs = 0;
const texts = new SmsCapture();

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
  process.env['OTP_SECRET'] = 'payment-links-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(API_CLOCK)
    .useValue(() => new Date(Date.now() + clockOffsetMs))
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Link {
  paymentUrl: string;
  amount: string;
  expiresAt: string;
}

interface StaffOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  advanceDue: string;
  due: string;
}

interface Setup {
  shop: ShopClient;
  key: string;
  variantId: string;
  locationId: number;
}

/** A shop with a bKash account shoppers pay into, a key for its website, and a product needing a 300 TK advance. */
async function payingShop(): Promise<Setup> {
  const shop = await openShop(port, texts, 'lnk');
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
    advanceAmount: 300,
    variants: [{ optionIds: [], openingStock: 10 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = await shop.post('/api-keys', { name: 'Website', websites: [WEBSITE] });
  const locations = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const mirpur = locations.zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  return {
    shop,
    key: (key.body as { key: string }).key,
    variantId: (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    locationId: mirpur?.id ?? 0,
  };
}

/** A phone order staff enter for one saree. */
async function enter(setup: Setup): Promise<StaffOrder> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
    },
    setup.shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as StaffOrder;
}

function link(
  shop: ShopClient,
  orderId: string,
  body: unknown = {},
  headers: Record<string, string> = shop.headers(),
): Promise<HttpResult> {
  return postJson(port, `/orders/${orderId}/payment-link`, body, headers);
}

/** A shopper's order through the website's key, as one visitor. */
function order(
  setup: Pick<Setup, 'key' | 'variantId' | 'locationId'>,
  extra: Record<string, unknown> = {},
  visitor = '203.0.113.7',
): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      ...extra,
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${setup.key}`,
      origin: WEBSITE,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'x-test-visitor': visitor,
    },
  );
}

function refOf(payment: { paymentUrl: string } | null | undefined): string {
  const ref = PAGE_URL.exec(payment?.paymentUrl ?? '')?.[1];
  if (!ref) throw new Error(`no payment page in ${JSON.stringify(payment)}`);
  return ref;
}

function page(ref: string): Promise<HttpResult> {
  return sendExact(port, 'GET', `/v1/pay/${ref}`, undefined, { host: 'api.localhost' });
}

function pay(ref: string, body: unknown): Promise<HttpResult> {
  return sendExact(port, 'POST', `/v1/pay/${ref}/transaction`, body, {
    host: 'api.localhost',
    'content-type': 'application/json',
  });
}

function report(ref: string, body: unknown, visitor: string): Promise<HttpResult> {
  return sendExact(port, 'POST', `/v1/pay/${ref}/report`, body, {
    host: 'api.localhost',
    'content-type': 'application/json',
    'x-test-visitor': visitor,
  });
}

async function reserved(variantId: string): Promise<number> {
  const rows = await admin.query<{ reserved: string }>(
    'SELECT reserved FROM tenant.stock_levels WHERE variant_id = $1',
    [variantId],
  );
  return Number(rows.rows[0]?.reserved ?? 0);
}

async function sessionsOf(orderId: string): Promise<{ source: string; state: string }[]> {
  const rows = await admin.query<{ source: string; state: string }>(
    'SELECT source, state FROM tenant.payment_sessions WHERE order_id = $1 ORDER BY created_at',
    [orderId],
  );
  return rows.rows;
}

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey): string {
  return translate(key, 'bn');
}

const PAYMENT = { method: 'bkash', returnUrl: `${WEBSITE}/thanks` };

describeIfDatabase('payment links staff send (PAY-24)', () => {
  it('ask for the advance still owed, else what is due, or the whole due; open 24 hours; the earlier link closes', async () => {
    const setup = await payingShop();
    const placed = await enter(setup);
    expect(placed.advanceDue).toBe('300.00');
    const first = await link(setup.shop, placed.id);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const made = first.body as Link;
    expect(made.amount).toBe('300.00');
    const hours = (Date.parse(made.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const shown = await page(refOf(made));
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    expect(shown.body).toMatchObject({
      orderNumber: placed.orderNumber,
      amount: '300.00',
      state: 'awaiting_payment',
      returnUrl: null,
      cancelUrl: null,
    });
    const whole = await link(setup.shop, placed.id, { full: true });
    expect((whole.body as Link).amount).toBe(placed.due);
    expect(((await page(refOf(made))).body as { state: string }).state).toBe('cancelled');
    // The advance paid by hand: the next link asks for what is left due.
    const cash = await setup.shop.post(`/orders/${placed.id}/payments`, {
      method: 'cash',
      amount: 300,
    });
    expect(cash.status, JSON.stringify(cash.body)).toBe(201);
    const rest = await link(setup.shop, placed.id);
    const left = (Number(placed.due) - 300).toFixed(2);
    expect((rest.body as Link).amount).toBe(left);
    expect(await sessionsOf(placed.id)).toEqual([
      { source: 'staff_link', state: 'cancelled' },
      { source: 'staff_link', state: 'cancelled' },
      { source: 'staff_link', state: 'awaiting_payment' },
    ]);
    const log = await admin.query<{ summary: unknown }>(
      'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY created_at',
      [setup.shop.tenantId, 'payment_link_made'],
    );
    expect(log.rows.map((row) => row.summary)).toEqual([
      { orderNumber: placed.orderNumber, amount: '300.00', replaced: false },
      { orderNumber: placed.orderNumber, amount: placed.due, replaced: true },
      { orderNumber: placed.orderNumber, amount: left, replaced: true },
    ]);
  });

  it('closes a checkout payment still awaiting money, for staff to take over', async () => {
    const setup = await payingShop();
    const placed = await order(setup, { payment: PAYMENT });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const checkout = (placed.body as { trackingId: string; payment: Link }).payment;
    const found = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.orders WHERE tracking_id = $1',
      [(placed.body as { trackingId: string }).trackingId],
    );
    const orderId = found.rows[0]?.id ?? '';
    const made = await link(setup.shop, orderId);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(((await page(refOf(checkout))).body as { state: string }).state).toBe('cancelled');
    expect(await sessionsOf(orderId)).toEqual([
      { source: 'checkout', state: 'cancelled' },
      { source: 'staff_link', state: 'awaiting_payment' },
    ]);
  });

  it('only expires unpaid: the order stays as it is, its stock held, and staff make another', async () => {
    const setup = await payingShop();
    const placed = await enter(setup);
    const made = (await link(setup.shop, placed.id)).body as Link;
    await admin.query(
      "UPDATE tenant.payment_sessions SET expires_at = now() - interval '1 minute' WHERE ref = $1",
      [refOf(made)],
    );
    await app.get(PaymentSessionExpiry).runTick(new Date());
    expect(await sessionsOf(placed.id)).toEqual([{ source: 'staff_link', state: 'expired' }]);
    const after = await setup.shop.get(`/orders/${placed.id}`);
    expect(after.body).toMatchObject({
      status: placed.status,
      paymentStatus: placed.paymentStatus,
      cancelReason: null,
    });
    expect(await reserved(setup.variantId)).toBe(1);
    const again = await link(setup.shop, placed.id);
    expect(again.status, JSON.stringify(again.body)).toBe(201);
  });

  it("refuses a reader, a payment being checked, nothing due, a cancelled order, no way to pay, and another shop's order", async () => {
    const setup = await payingShop();
    const placed = await enter(setup);
    const reader = await staffWith(port, texts, admin, setup.shop, ['orders:read']);
    expect((await link(setup.shop, placed.id, {}, reader)).status).toBe(403);
    const made = (await link(setup.shop, placed.id)).body as Link;
    const paid = await pay(refOf(made), { method: 'bkash', transactionId: 'CHK1234567' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    const checking = await link(setup.shop, placed.id);
    expect(checking.status).toBe(409);
    expect(errorOf(checking).message).toBe(said('PaymentBeingChecked'));
    expect(await sessionsOf(placed.id)).toEqual([{ source: 'staff_link', state: 'checking' }]);

    const settled = await enter(setup);
    await setup.shop.post(`/orders/${settled.id}/payments`, {
      method: 'cash',
      amount: Number(settled.due),
    });
    const nothing = await link(setup.shop, settled.id);
    expect(nothing.status).toBe(409);
    expect(errorOf(nothing).message).toBe(said('OrderNothingDue'));

    const cancelled = await enter(setup);
    const cancel = await setup.shop.post(`/orders/${cancelled.id}/cancel`, {
      reason: 'customer_cancelled',
    });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    const closed = await link(setup.shop, cancelled.id);
    expect(closed.status).toBe(409);
    expect(errorOf(closed).message).toBe(said('OrderIsCancelled'));

    const other = await openShop(port, texts, 'lnk');
    const elsewhere = await link(other, placed.id);
    expect(elsewhere.status).toBe(404);
    expect(errorOf(elsewhere).code).toBe('not_found');

    await setup.shop.put('/payment-methods/bkash', { enabled: false, accounts: [] });
    const unpayable = await enter(setup);
    const none = await link(setup.shop, unpayable.id);
    expect(none.status).toBe(409);
    expect(errorOf(none).details).toMatchObject({ reason: 'no_payment_method' });
    for (const refused of [settled, cancelled, unpayable]) {
      expect(await sessionsOf(refused.id)).toEqual([]);
    }
  });
});

describeIfDatabase("the shop's payment-session flood guard (RTE-08)", () => {
  it("holds the shop's shoppers to the operator's figure a minute, never a cash order, and counts what it refuses", async () => {
    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.PaymentSessionsPerShopPerMinute, 2, randomUUID());
    try {
      const setup = await payingShop();
      for (const visitor of ['198.51.100.21', '198.51.100.22']) {
        const placed = await order(setup, { payment: PAYMENT }, visitor);
        expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      }
      const third = await order(setup, { payment: PAYMENT }, '198.51.100.23');
      expect(third.status).toBe(429);
      expect(errorOf(third).code).toBe('rate_limited');
      expect(third.headers['retry-after']).toBeDefined();
      expect(await reserved(setup.variantId)).toBe(2);
      const bag = await setup.shop.post('/products', {
        name: 'Bag',
        basePrice: 500,
        variants: [{ optionIds: [], openingStock: 5 }],
      });
      const bagId = (bag.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
      const cod = await order(
        { ...setup, variantId: bagId },
        { payment: PAYMENT },
        '198.51.100.24',
      );
      expect(cod.status, JSON.stringify(cod.body)).toBe(201);
      expect((cod.body as { payment: unknown }).payment).toBeNull();
      await app.get(RequestQuota).flush();
      const { rows } = await admin.query<{ refused_sessions: number; refused_orders: number }>(
        'SELECT refused_sessions, refused_orders FROM control.api_usage WHERE tenant_id = $1',
        [setup.shop.tenantId],
      );
      expect(rows).toEqual([{ refused_sessions: 1, refused_orders: 0 }]);
    } finally {
      await settings.set(PlatformSettingKey.PaymentSessionsPerShopPerMinute, 60, randomUUID());
    }
  });
});

describeIfDatabase('Report this page (TVR-02)', () => {
  it("records a shopper's report for Lytro with its shop, reason and note; 5 an hour from one visitor", async () => {
    const setup = await payingShop();
    const placed = await order(setup, { payment: PAYMENT });
    const payment = (placed.body as { payment: Link }).payment;
    const ref = refOf(payment);
    const vague = await report(ref, { reason: 'other' }, '198.51.100.31');
    expect(fieldsOf(vague)).toEqual({ note: 'required' });
    const first = await report(ref, { reason: 'asked_for_pin' }, '198.51.100.31');
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toEqual({ ok: true });
    const note = 'They asked me to send money to another number';
    expect((await report(ref, { reason: 'other', note }, '198.51.100.31')).status).toBe(201);
    for (let index = 0; index < 3; index += 1) {
      expect((await report(ref, { reason: 'wrong_amount' }, '198.51.100.31')).status).toBe(201);
    }
    const sixth = await report(ref, { reason: 'wrong_shop' }, '198.51.100.31');
    expect(sixth.status).toBe(429);
    expect(errorOf(sixth).code).toBe('rate_limited');
    expect((await report(ref, { reason: 'wrong_shop' }, '198.51.100.32')).status).toBe(201);
    expect((await report('A'.repeat(22), { reason: 'wrong_shop' }, '198.51.100.33')).status).toBe(
      404,
    );
    const rows = await admin.query<Record<string, unknown>>(
      `SELECT tenant_id, ref, reason, note, host(ip) AS ip, status FROM control.payment_page_reports
       WHERE ref = $1 ORDER BY created_at`,
      [ref],
    );
    expect(rows.rows).toHaveLength(6);
    expect(rows.rows[1]).toEqual({
      tenant_id: setup.shop.tenantId,
      ref,
      reason: 'other',
      note,
      ip: '198.51.100.31',
      status: 'open',
    });
    // The operator's queue lists them, newest first, with the shop and the page to open (ADM-12).
    const listed = await app.get(PaymentPageOversight).list(PaymentPageReportStatus.Open, 100);
    const ours = listed.filter((row) => row.shop.id === setup.shop.tenantId);
    expect(ours).toHaveLength(6);
    expect(ours[0]).toMatchObject({
      shop: { slug: setup.shop.slug, paymentPageSuspended: false },
      paymentUrl: payment.paymentUrl,
      reason: 'wrong_shop',
      ip: '198.51.100.32',
      status: 'open',
      handledAt: null,
    });
  });
});

describeIfDatabase("Lytro's watch over the payment pages (TVR-03, ADM-12)", () => {
  it('suspends a page at once: open pages unavailable, payments and links refused, its reports acted on, audited', async () => {
    const setup = await payingShop();
    const tenantId = setup.shop.tenantId;
    const placed = await order(setup, { payment: PAYMENT });
    const ref = refOf((placed.body as { payment: Link }).payment);
    expect((await report(ref, { reason: 'asked_for_pin' }, '198.51.100.41')).status).toBe(201);
    const phoned = await enter(setup);
    const oversight = app.get(PaymentPageOversight);
    const reason = 'Reported for asking shoppers for their PIN';
    await oversight.suspend(tenantId, reason, OPERATOR_ID, '203.0.113.9');
    clockOffsetMs += PAST_SHOP_LOOKUP_MS;

    const shown = await page(ref);
    expect(shown.status).toBe(403);
    expect(errorOf(shown).code).toBe('tenant_offline');
    expect(errorOf(shown).message).toBe(said('PaymentPageUnavailable'));
    expect((await pay(ref, { method: 'bkash', transactionId: 'SUS1234567' })).status).toBe(403);
    const refused = await order(setup, { payment: PAYMENT });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ reason: 'no_payment_method' });
    const noLink = await link(setup.shop, phoned.id);
    expect(noLink.status).toBe(409);
    expect(errorOf(noLink).message).toBe(said('ShopPaymentPageSuspended'));

    const reports = await admin.query(
      'SELECT status, handled_by FROM control.payment_page_reports WHERE tenant_id = $1',
      [tenantId],
    );
    expect(reports.rows).toEqual([{ status: 'actioned', handled_by: OPERATOR_ID }]);
    const shopLog = await admin.query(
      'SELECT actor_type, actor_id, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
      [tenantId, 'payment_page_suspended'],
    );
    expect(shopLog.rows).toEqual([
      { actor_type: 'platform_support', actor_id: null, summary: { reason, reports: 1 } },
    ]);
    const platformLog = await admin.query(
      'SELECT actor_id, host(ip) AS ip, summary FROM control.platform_audit_log WHERE action = $1 AND target_id = $2',
      ['payment_page_suspended', tenantId],
    );
    expect(platformLog.rows).toEqual([
      { actor_id: OPERATOR_ID, ip: '203.0.113.9', summary: { reason, reports: 1 } },
    ]);
    await expect(oversight.suspend(tenantId, reason, OPERATOR_ID, null)).rejects.toMatchObject({
      code: 'conflict',
    });

    await oversight.restore(tenantId, OPERATOR_ID, null);
    clockOffsetMs += PAST_SHOP_LOOKUP_MS;
    expect((await page(ref)).status).toBe(200);
    expect((await link(setup.shop, phoned.id)).status).toBe(201);
    expect((await order(setup, { payment: PAYMENT })).status).toBe(201);
    const restored = await admin.query(
      'SELECT count(*)::int AS n FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
      [tenantId, 'payment_page_restored'],
    );
    expect(restored.rows).toEqual([{ n: 1 }]);
    await expect(oversight.restore(tenantId, OPERATOR_ID, null)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(oversight.suspend(randomUUID(), reason, OPERATOR_ID, null)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('dismisses an open report, leaving the shop as it is; the routes need an operator session', async () => {
    const setup = await payingShop();
    const placed = await order(setup, { payment: PAYMENT });
    const ref = refOf((placed.body as { payment: Link }).payment);
    expect((await report(ref, { reason: 'wrong_amount' }, '198.51.100.51')).status).toBe(201);
    const made = await admin.query<{ id: string }>(
      'SELECT id FROM control.payment_page_reports WHERE ref = $1',
      [ref],
    );
    const id = made.rows[0]?.id ?? '';
    const oversight = app.get(PaymentPageOversight);
    await oversight.dismiss(id, OPERATOR_ID, null);
    const after = await admin.query(
      'SELECT status, handled_by FROM control.payment_page_reports WHERE id = $1',
      [id],
    );
    expect(after.rows).toEqual([{ status: 'dismissed', handled_by: OPERATOR_ID }]);
    const logged = await admin.query(
      'SELECT actor_id, summary FROM control.platform_audit_log WHERE action = $1 AND target_id = $2',
      ['payment_page_report_dismissed', id],
    );
    expect(logged.rows).toEqual([
      { actor_id: OPERATOR_ID, summary: { tenantId: setup.shop.tenantId, reason: 'wrong_amount' } },
    ]);
    await expect(oversight.dismiss(id, OPERATOR_ID, null)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await page(ref)).status).toBe(200);

    expect((await getJson(port, '/operator/payment-page-reports', {})).status).toBe(401);
    const suspend = await postJson(
      port,
      `/operator/tenants/${setup.shop.tenantId}/payment-page/suspend`,
      { reason: 'No session' },
      {},
    );
    expect(suspend.status).toBe(401);
  });
});
