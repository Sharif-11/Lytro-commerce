import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PaygFairUseMode, PlatformSettingKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { StorefrontActivation } from '../src/modules/balance/services/storefront-activation';
import { PlanStarted } from '../src/modules/billing/services/plan-started';
import type { OrderNotifier, PlacedOrderNotice } from '../src/modules/orders/ports/order-notifier';
import { ORDER_NOTIFIER } from '../src/modules/orders/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { ApiCharges } from '../src/modules/public-api/services/api-charges';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TenantService } from '../src/modules/tenancy/services/tenant.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// PAYG-FAIR-USE-PLAN (2026-11-23): pay-as-you-go fair use behind the operator's switch -- an order from Lytro locked
// and masked until its phone (৳7) and confirm (৳3) are paid, the storefront paused until the activation top-up, its
// contact hidden, a plan opening every locked order, and the API's free allowance, cap and nightly charge. With the
// switch off, pay-as-you-go works as before. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payg_fair_use_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SECRET = 'payg-fair-use-e2e-secret-0123456789abcdefghij';
const API_HOST = 'api.localhost';
const SITE = 'https://myshop.com';

class NoticeCapture implements OrderNotifier {
  readonly sent: PlacedOrderNotice[] = [];
  orderPlaced(notice: PlacedOrderNotice): Promise<void> {
    this.sent.push(notice);
    return Promise.resolve();
  }
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const notices = new NoticeCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payg-fair-use-e2e-otp-secret-0123456789abc';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ORDER_NOTIFIER)
    .useValue(notices)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['STOREFRONT_SECRET'];
  await app.close();
  await admin.end();
});

beforeEach(async () => {
  if (!ADMIN_URL) return;
  notices.sent.length = 0;
  await fairUse(true);
});

async function fairUse(on: boolean): Promise<void> {
  await app
    .get(PlatformSettingsService)
    .set(
      PlatformSettingKey.PaygFairUse,
      on ? PaygFairUseMode.On : PaygFairUseMode.Off,
      randomUUID(),
    );
}

interface Caller {
  key: string;
  origin: string;
}

async function storefrontKey(shop: ShopClient): Promise<Caller> {
  const result = await sendExact(
    port,
    'GET',
    `/api/v1/internal/storefront/context?host=${encodeURIComponent(`${shop.slug}.localhost`)}`,
    undefined,
    { host: 'localhost', 'x-lytro-storefront': SECRET },
  );
  const found = (result.body as { shop: { key: string; origin: string } | null }).shop;
  if (!found) throw new Error('an open shop has a storefront key');
  return { key: found.key, origin: found.origin };
}

async function ownKey(shop: ShopClient): Promise<Caller> {
  const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { key: (made.body as { key: string }).key, origin: SITE };
}

function call(
  caller: Caller,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
): Promise<HttpResult> {
  return sendExact(port, method, path, payload, {
    host: API_HOST,
    authorization: `Bearer ${caller.key}`,
    origin: caller.origin,
    'x-test-visitor': `203.0.113.${String(randomInt(1, 250))}`,
    ...(payload === undefined
      ? {}
      : { 'content-type': 'application/json', 'idempotency-key': randomUUID() }),
  });
}

let thana: number | null = null;
async function mirpur(shop: ShopClient): Promise<number> {
  if (thana !== null) return thana;
  const zillas = (
    (await shop.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    }
  ).zillas;
  thana =
    zillas.find((z) => z.nameEn === 'Dhaka')?.thanas.find((t) => t.nameEn === 'Mirpur')?.id ?? 0;
  return thana;
}

async function product(shop: ShopClient, price = 500): Promise<string> {
  const made = await shop.post('/products', {
    name: `Saree ${randomUUID().slice(0, 6)}`,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 20 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

/** A shop on its trial with one product, moved to pay-as-you-go with this balance; paid before, or never. */
async function payAsYouGoShop(
  balance: string,
  activated = true,
): Promise<{ shop: ShopClient; variantId: string }> {
  const shop = await openShop(port, texts, 'fu');
  const variantId = await product(shop);
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go', period_end = NULL,
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
       plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go'),
       storefront_activated_at = ${activated ? 'now()' : 'NULL'}
     WHERE id = $1`,
    [shop.tenantId],
  );
  await seedBalance(admin, shop.tenantId, balance);
  return { shop, variantId };
}

const PHONE = '01711234842';

async function storefrontOrder(
  shop: ShopClient,
  variantId: string,
): Promise<{ id: string; number: string }> {
  const sf = await storefrontKey(shop);
  const made = await call(sf, 'POST', '/v1/orders', {
    customerName: 'সাদিয়া রহমান',
    phone: PHONE,
    locationId: await mirpur(shop),
    deliveryAddress: 'বাসা ১২/বি, রোড ৩',
    shopperNote: 'Call me at 01811111111',
    items: [{ variantId, quantity: 1 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const number = (made.body as { orderNumber: string }).orderNumber;
  const { rows } = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.orders WHERE tenant_id = $1 AND order_number = $2',
    [shop.tenantId, number],
  );
  return { id: rows[0]?.id ?? '', number };
}

async function ledger(
  tenantId: string,
  type: string,
): Promise<{ amount: string; reference: unknown }[]> {
  const { rows } = await admin.query<{ amount: string; reference: unknown }>(
    'SELECT amount, reference FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = $2 ORDER BY id',
    [tenantId, type],
  );
  return rows;
}

interface Detail {
  access: string;
  handledAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  shopperNote: string | null;
  location: unknown;
  district: { nameEn: string } | null;
  customerId: string | null;
}

describeIfDatabase('with fair use off, pay-as-you-go works as before (PYG-30)', () => {
  it('leaves a storefront order open, its customer made, and charges nothing at its arrival', async () => {
    await fairUse(false);
    const { shop, variantId } = await payAsYouGoShop('100.00', false);
    const order = await storefrontOrder(shop, variantId);
    const detail = (await shop.get(`/orders/${order.id}`)).body as Detail;
    expect(detail).toMatchObject({
      access: 'open',
      customerPhone: PHONE,
      deliveryAddress: 'বাসা ১২/বি, রোড ৩',
    });
    expect(detail.customerId).not.toBeNull();
    expect(await ledger(shop.tenantId, 'order_unlock')).toEqual([]);
    // The storefront of a shop that never paid is not paused either.
    const sf = await storefrontKey(shop);
    expect(((await call(sf, 'GET', '/v1/shop')).body as { paused: boolean }).paused).toBe(false);
  });
});

describeIfDatabase(
  'an order from Lytro, locked until opened (PF-1 to PF-7, PF-21 to PF-28)',
  () => {
    it('arrives locked and masked everywhere: detail, list, search, notice, customers', async () => {
      const { shop, variantId } = await payAsYouGoShop('100.00');
      const order = await storefrontOrder(shop, variantId);
      const detail = (await shop.get(`/orders/${order.id}`)).body as Detail;
      expect(detail).toMatchObject({
        access: 'locked',
        customerName: 'স•••',
        customerPhone: '017•••••842',
        deliveryAddress: null,
        shopperNote: null,
        location: null,
        customerId: null,
      });
      expect(detail.district?.nameEn).toBe('Dhaka');
      const list = (await shop.get('/orders')).body as {
        locked: number;
        orders: { customerPhone: string; area: { thana: unknown; zilla: { nameEn: string } } }[];
      };
      expect(list.locked).toBe(1);
      expect(list.orders[0]).toMatchObject({
        customerPhone: '017•••••842',
        area: { thana: null },
      });
      // PF-26: a locked order is found by its number, never by its phone or name.
      expect(((await shop.get('/orders?q=1234842')).body as { total: number }).total).toBe(0);
      expect(((await shop.get(`/orders?q=${order.number}`)).body as { total: number }).total).toBe(
        1,
      );
      expect(((await shop.get('/orders?access=locked')).body as { total: number }).total).toBe(1);
      // PF-28: the notice names no one.
      expect(notices.sent.at(-1)).toMatchObject({ customerName: null, locked: { fee: '7.0000' } });
      // PF-27: no customer until the phone is shown.
      expect(((await shop.get('/customers')).body as { total: number }).total).toBe(0);
    });

    it("refuses another shop's order: 404, nothing shown and nothing charged (SEC-02)", async () => {
      const { shop, variantId } = await payAsYouGoShop('100.00');
      const { shop: other } = await payAsYouGoShop('100.00');
      const order = await storefrontOrder(shop, variantId);
      const taken = await other.post(`/orders/${order.id}/unlock-phone`, {});
      expect(taken.status).toBe(404);
      expect(await ledger(shop.tenantId, 'order_unlock')).toEqual([]);
      expect(await ledger(other.tenantId, 'order_unlock')).toEqual([]);
      expect(((await shop.get(`/orders/${order.id}`)).body as Detail).customerPhone).toBe(
        '017•••••842',
      );
    });

    it('shows the phone for ৳7, once however often it is tapped, then confirms on a call for ৳3', async () => {
      const { shop, variantId } = await payAsYouGoShop('100.00');
      const order = await storefrontOrder(shop, variantId);
      // A call needs the phone first.
      const early = await shop.post(`/orders/${order.id}/calls`, { outcome: 'confirmed' });
      expect(early.status).toBe(409);
      expect(errorOf(early).code).toBe('conflict');
      const shown = await shop.post(`/orders/${order.id}/unlock-phone`, {});
      expect(shown.status, JSON.stringify(shown.body)).toBe(200);
      expect(shown.body).toMatchObject({
        access: 'phone',
        customerName: 'সাদিয়া রহমান',
        customerPhone: PHONE,
        shopperNote: 'Call me at 01811111111',
        deliveryAddress: null,
      });
      expect((shown.body as Detail).customerId).not.toBeNull();
      await shop.post(`/orders/${order.id}/unlock-phone`, {});
      // PF-8: the day's cap counted it at step 1, once.
      expect(((await shop.get(`/orders/${order.id}`)).body as Detail).handledAt).not.toBeNull();
      expect(await ledger(shop.tenantId, 'order_unlock')).toEqual([
        { amount: '-7.00', reference: { orderId: order.id, step: 'phone', rate: '7.0000' } },
      ]);
      const confirmed = await shop.post(`/orders/${order.id}/calls`, { outcome: 'confirmed' });
      expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
      expect(confirmed.body).toMatchObject({
        access: 'confirmed',
        deliveryAddress: 'বাসা ১২/বি, রোড ৩',
      });
      expect((await ledger(shop.tenantId, 'order_unlock')).map((row) => row.amount)).toEqual([
        '-7.00',
        '-3.00',
      ]);
    });

    it('refuses the phone short of the balance, the order staying locked, and lets it be cancelled free', async () => {
      const { shop, variantId } = await payAsYouGoShop('5.00');
      const order = await storefrontOrder(shop, variantId);
      const refused = await shop.post(`/orders/${order.id}/unlock-phone`, {});
      expect(refused.status).toBe(429);
      expect(((await shop.get(`/orders/${order.id}`)).body as Detail).access).toBe('locked');
      const cancelled = await shop.post(`/orders/${order.id}/cancel`, { reason: 'fake_order' });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      expect(await ledger(shop.tenantId, 'order_unlock')).toEqual([]);
    });

    it('opens every locked order free when the shop buys a plan (PF-33)', async () => {
      const { shop, variantId } = await payAsYouGoShop('100.00');
      const order = await storefrontOrder(shop, variantId);
      await app
        .get(TenantService)
        .runStandalone((tx) => app.get(PlanStarted).within(tx, shop.tenantId, true, new Date()));
      const detail = (await shop.get(`/orders/${order.id}`)).body as Detail;
      expect(detail).toMatchObject({ access: 'open', customerPhone: PHONE });
      expect(detail.customerId).not.toBeNull();
      expect(await ledger(shop.tenantId, 'order_unlock')).toEqual([]);
    });

    it('charges nothing when a manual order is shipped by hand (PF-11)', async () => {
      const { shop, variantId } = await payAsYouGoShop('100.00');
      const made = await postJson(
        port,
        '/orders',
        {
          customerName: 'Karim',
          phone: `017${String(randomInt(10_000_000, 99_999_999))}`,
          locationId: await mirpur(shop),
          deliveryAddress: 'Road 1',
          items: [{ variantId, quantity: 1 }],
        },
        shop.headers({ 'idempotency-key': randomUUID() }),
      );
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const id = (made.body as { id: string }).id;
      const shipped = await shop.post(`/orders/${id}/ship`, {
        courierName: 'Steadfast',
        trackingCode: 'SF1',
      });
      expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
      expect(await ledger(shop.tenantId, 'order_fee')).toEqual([]);
    });
  },
);

describeIfDatabase('the paused storefront and its activation (PF-13, PF-15, PF-35, PF-40)', () => {
  it('answers only the shop and tracking until the shop tops up the activation amount', async () => {
    const { shop } = await payAsYouGoShop('0', false);
    const sf = await storefrontKey(shop);
    const own = await shop.get('/me');
    expect((own.body as { tenant: { fairUse: { paused: boolean } } }).tenant.fairUse.paused).toBe(
      true,
    );
    const shown = await call(sf, 'GET', '/v1/shop');
    expect(shown.status).toBe(200);
    expect((shown.body as { paused: boolean }).paused).toBe(true);
    const list = await call(sf, 'GET', '/v1/catalogue/products');
    expect(list.status).toBe(403);
    expect(errorOf(list).details).toMatchObject({ paused: true });
    await app
      .get(TenantService)
      .runStandalone((tx) =>
        app.get(StorefrontActivation).toppedUpWithin(tx, shop.tenantId, '10.00', new Date()),
      );
    // The cached shop row is read again within seconds.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const again = await shop.get('/me');
    expect((again.body as { tenant: { fairUse: { paused: boolean } } }).tenant.fairUse.paused).toBe(
      false,
    );
  });

  it('a top-up below the activation amount opens nothing', async () => {
    const { shop } = await payAsYouGoShop('0', false);
    await app
      .get(TenantService)
      .runStandalone((tx) =>
        app.get(StorefrontActivation).toppedUpWithin(tx, shop.tenantId, '5.00', new Date()),
      );
    const { rows } = await admin.query<{ at: Date | null }>(
      'SELECT storefront_activated_at AS at FROM control.tenants WHERE id = $1',
      [shop.tenantId],
    );
    expect(rows[0]?.at).toBeNull();
  });

  it("hides the shop's phone, email, WhatsApp and Messenger on pay-as-you-go, keeping its address", async () => {
    const { shop } = await payAsYouGoShop('0');
    await admin.query(
      `UPDATE control.tenants SET contact_phone = '01811112222', business_address = 'Mirpur 10' WHERE id = $1`,
      [shop.tenantId],
    );
    const sf = await storefrontKey(shop);
    const shown = (await call(sf, 'GET', '/v1/shop')).body as {
      contact: {
        phone: string | null;
        email: string | null;
        whatsapp: string | null;
        messenger: string | null;
        address: string | null;
      };
    };
    expect(shown.contact).toMatchObject({
      phone: null,
      email: null,
      whatsapp: null,
      messenger: null,
      address: 'Mirpur 10',
    });
    // The same shop on a plan shows its phone.
    await fairUse(false);
    const open = (await call(sf, 'GET', '/v1/shop')).body as { contact: { phone: string | null } };
    expect(open.contact.phone).toBe('01811112222');
  });

  it("shows the shop's phone on an order's tracking once the seller has seen the shopper's (PFQ-5)", async () => {
    const { shop, variantId } = await payAsYouGoShop('100.00');
    await admin.query(`UPDATE control.tenants SET contact_phone = '01811112222' WHERE id = $1`, [
      shop.tenantId,
    ]);
    const order = await storefrontOrder(shop, variantId);
    const { rows } = await admin.query<{ tracking_id: string }>(
      'SELECT tracking_id FROM tenant.orders WHERE id = $1',
      [order.id],
    );
    const sf = await storefrontKey(shop);
    const tracked = async (): Promise<string | null> => {
      const read = await call(sf, 'GET', `/v1/track/${rows[0]?.tracking_id ?? ''}`);
      return (read.body as { shopPhone: string | null }).shopPhone;
    };
    // Locked: the shopper's page shows no way to reach the shop.
    expect(await tracked()).toBeNull();
    expect((await shop.post(`/orders/${order.id}/unlock-phone`, {})).status).toBe(200);
    expect(await tracked()).toBe('01811112222');
    // PF-40: every other page still hides it.
    const page = (await call(sf, 'GET', '/v1/shop')).body as { contact: { phone: string | null } };
    expect(page.contact.phone).toBeNull();
    // With fair use off the shop's pages show its phone, so tracking adds none of its own.
    await fairUse(false);
    expect(await tracked()).toBeNull();
  });
});

describeIfDatabase("the shop's own website's API on pay-as-you-go (PF-14, PF-36, PF-37)", () => {
  it('serves the free allowance, then stops at a cap of ৳0, still taking orders', async () => {
    const { shop, variantId } = await payAsYouGoShop('100.00');
    await app
      .get(PlatformSettingsService)
      .set(PlatformSettingKey.PaygApiFreeRequests, 2, randomUUID());
    const capped = await shop.put('/api-keys/cap', { cap: 0 });
    expect(capped.status, JSON.stringify(capped.body)).toBe(200);
    const site = await ownKey(shop);
    expect((await call(site, 'GET', '/v1/shop')).status).toBe(200);
    expect((await call(site, 'GET', '/v1/shop')).status).toBe(200);
    const stopped = await call(site, 'GET', '/v1/shop');
    expect(stopped.status).toBe(429);
    expect(errorOf(stopped).code).toBe('quota_exceeded');
    // QTA-07: placing an order is still served.
    const placed = await call(site, 'POST', '/v1/orders', {
      customerName: 'Rahim',
      phone: `017${String(randomInt(10_000_000, 99_999_999))}`,
      locationId: await mirpur(shop),
      deliveryAddress: 'Road 2',
      items: [{ variantId, quantity: 1 }],
    });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    await app
      .get(PlatformSettingsService)
      .set(PlatformSettingKey.PaygApiFreeRequests, 10_000, randomUUID());
  });

  it("keeps a shop's API cap and charges its own (SEC-02)", async () => {
    const { shop } = await payAsYouGoShop('100.00');
    const { shop: other } = await payAsYouGoShop('100.00');
    type Summary = { cap: string; charged: string; cycleStart: string };
    const before = (await other.get('/api-keys/charges')).body as Summary;
    expect((await shop.put('/api-keys/cap', { cap: 50 })).status).toBe(200);
    const summary = (await shop.get('/api-keys/charges')).body as Summary;
    await admin.query(
      `INSERT INTO control.api_usage (tenant_id, cycle_start, requests, billable) VALUES ($1, $2, 12500, 12500)
       ON CONFLICT (tenant_id, cycle_start) DO UPDATE SET requests = 12500, billable = 12500`,
      [shop.tenantId, summary.cycleStart],
    );
    await app.get(ApiCharges).chargeDay(new Date(Date.now() + 60 * 60 * 1000));
    const mine = (await shop.get('/api-keys/charges')).body as Summary;
    expect(mine.charged).toBe('2.00');
    expect(Number(mine.cap)).toBe(50);
    expect((await other.get('/api-keys/charges')).body).toMatchObject({
      cap: before.cap,
      charged: before.charged,
    });
    expect(await ledger(other.tenantId, 'api_requests')).toEqual([]);
  });

  it('charges whole 1,000s past the free allowance each night, once, within the cap', async () => {
    const { shop } = await payAsYouGoShop('100.00');
    const now = new Date();
    const summary = (await shop.get('/api-keys/charges')).body as { cycleStart: string };
    await admin.query(
      `INSERT INTO control.api_usage (tenant_id, cycle_start, requests, billable) VALUES ($1, $2, 12500, 12500)
       ON CONFLICT (tenant_id, cycle_start) DO UPDATE SET requests = 12500, billable = 12500`,
      [shop.tenantId, summary.cycleStart],
    );
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    await app.get(ApiCharges).chargeDay(later);
    await app.get(ApiCharges).chargeDay(later);
    const charged = await ledger(shop.tenantId, 'api_requests');
    expect(charged).toHaveLength(1);
    expect(charged[0]).toMatchObject({ amount: '-2.00', reference: { blocks: 2 } });
    const after = (await shop.get('/api-keys/charges')).body as {
      charged: string;
      requests: number;
    };
    expect(after.charged).toBe('2.00');
  });

  it('emails the owner at 80% of the cap and at the stop, once each, never by SMS (PF-36)', async () => {
    const { shop } = await payAsYouGoShop('100.00');
    const email = `owner.${randomUUID().slice(0, 8)}@example.com`;
    await admin.query(
      `UPDATE tenant.users SET email = $2, language = 'en' WHERE tenant_id = $1 AND is_owner`,
      [shop.tenantId, email],
    );
    expect((await shop.put('/api-keys/cap', { cap: 10 })).status).toBe(200);
    const { cycleStart } = (await shop.get('/api-keys/charges')).body as { cycleStart: string };
    const used = (billable: number) =>
      admin.query(
        `INSERT INTO control.api_usage (tenant_id, cycle_start, requests, billable) VALUES ($1, $2, $3, $3)
         ON CONFLICT (tenant_id, cycle_start) DO UPDATE SET requests = $3, billable = $3`,
        [shop.tenantId, cycleStart, billable],
      );
    const mails = async (): Promise<{ subject: string; body: string }[]> =>
      (
        await admin.query<{ subject: string; body: string }>(
          'SELECT subject, body FROM control.mail_outbox WHERE to_email = $1 ORDER BY created_at',
          [email],
        )
      ).rows;
    const textsBefore = texts.sent.length;
    const hour = 60 * 60 * 1000;
    // 8,500 past the free 10,000: ৳8 charged, 80% of the ৳10 cap.
    await used(18_500);
    await app.get(ApiCharges).chargeDay(new Date(Date.now() + hour));
    await app.get(ApiCharges).chargeDay(new Date(Date.now() + hour));
    const warned = await mails();
    expect(warned.map((mail) => mail.subject)).toEqual(['API spending at 80% of your limit']);
    expect(warned[0]?.body).toContain('8.00 TK of 10.00 TK');
    // The next day reaches the cap: the stop it warned of.
    await used(20_000);
    await app.get(ApiCharges).chargeDay(new Date(Date.now() + 25 * hour));
    expect((await mails()).map((mail) => mail.subject)).toEqual([
      'API spending at 80% of your limit',
      "Your website's API has stopped",
    ]);
    expect(texts.sent.length).toBe(textsBefore);
  });
});
