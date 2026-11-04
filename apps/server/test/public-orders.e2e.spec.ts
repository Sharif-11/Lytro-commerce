import 'dotenv/config';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlatformSettingKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import type { OrderNotifier, PlacedOrderNotice } from '../src/modules/orders/ports/order-notifier';
import { ORDER_NOTIFIER } from '../src/modules/orders/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import type {
  MetaConversions,
  MetaServerEvent,
} from '../src/modules/public-api/ports/meta-conversions';
import { MetaPurchaseSender } from '../src/modules/public-api/services/meta-purchase-sender';
import { RequestQuota } from '../src/modules/public-api/services/request-quota';
import { META_CONVERSIONS } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.2, agreed 2026-10-30: a shopper's cash-on-delivery order through a public key (ORD-02, ORD-21) --
// made as a staff order is, refused what a shopper may not order (PRD-06, ATR-07, D4-2, DLV-06, DLV-07), pending until
// the shop's call (ORD-07), audited by the key's name (API-21), told to staff once (ORD-20) and to Meta from the queue
// (LND-16) -- its per-minute windows (RTE-06, RTE-08), and tracking by ID (ORD-17). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_public_orders_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SECRET = 'public-orders-e2e-secret-0123456789abcdefghijk';
const API_HOST = 'api.localhost';
const SITE = 'https://myshop.com';

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

/** ORD-20: the notices staff would be sent. */
class NoticeCapture implements OrderNotifier {
  readonly sent: PlacedOrderNotice[] = [];
  orderPlaced(notice: PlacedOrderNotice): Promise<void> {
    this.sent.push(notice);
    return Promise.resolve();
  }
}

/** LND-16: Meta, as far as the test needs it: what it was sent, and whether it is away. */
class MetaCapture implements MetaConversions {
  readonly sent: { pixelId: string; token: string; events: MetaServerEvent[] }[] = [];
  calls = 0;
  away = false;
  send(pixelId: string, token: string, events: MetaServerEvent[]): Promise<void> {
    this.calls += 1;
    if (this.away) return Promise.reject(new Error('Meta is away'));
    this.sent.push({ pixelId, token, events });
    return Promise.resolve();
  }
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const notices = new NoticeCapture();
const meta = new MetaCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'public-orders-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(ORDER_NOTIFIER)
    .useValue(notices)
    .overrideProvider(META_CONVERSIONS)
    .useValue(meta)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['STOREFRONT_SECRET'];
  await app.close();
  await admin.end();
});

beforeEach(() => {
  notices.sent.length = 0;
  meta.sent.length = 0;
  meta.calls = 0;
  meta.away = false;
});

interface Caller {
  key: string;
  origin: string;
}

interface Placed {
  orderNumber: string;
  trackingId: string;
  status: string;
  items: { variantId: string; productName: string; quantity: string; itemTotal: string }[];
  subtotal: string;
  deliveryCharge: string;
  grandTotal: string;
  codAmount: string;
  purchaseEventId: string;
}

interface Tracked {
  status: string;
  timeline: { step: string }[];
  items: { productName: string; quantity: string }[];
  grandTotal: string;
  courier: { name: string | null; trackingCode: string | null; trackingLink: string | null } | null;
}

/** A key the shop made for its own website. */
async function ownKey(shop: ShopClient): Promise<Caller> {
  const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { key: (made.body as { key: string }).key, origin: SITE };
}

/** The key Lytro keeps for the shop's storefront, as the storefront's own server reads it. */
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

function call(
  caller: Caller,
  method: 'GET' | 'POST',
  path: string,
  payload: unknown,
  extra: Record<string, string> = {},
): Promise<HttpResult> {
  return sendExact(port, method, path, payload, {
    host: API_HOST,
    authorization: `Bearer ${caller.key}`,
    origin: caller.origin,
    ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    ...extra,
  });
}

function order(
  caller: Caller,
  body: unknown,
  key: string | null = randomUUID(),
  visitor = '203.0.113.7',
): Promise<HttpResult> {
  return call(caller, 'POST', '/v1/orders', body, {
    'x-test-visitor': visitor,
    ...(key === null ? {} : { 'idempotency-key': key }),
  });
}

function track(caller: Caller, trackingId: string, visitor = '203.0.113.7'): Promise<HttpResult> {
  return call(caller, 'GET', `/v1/track/${trackingId}`, undefined, { 'x-test-visitor': visitor });
}

async function placed(caller: Caller, body: unknown): Promise<Placed> {
  const made = await order(caller, body);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Placed;
}

interface Locations {
  zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}
let locations: Locations | null = null;

async function thanaId(shop: ShopClient, zilla: string, thana: string): Promise<number> {
  if (!locations) locations = (await shop.get('/locations')).body as Locations;
  const found = locations.zillas
    .find((row) => row.nameEn === zilla)
    ?.thanas.find((row) => row.nameEn === thana);
  if (!found) throw new Error(`no thana ${zilla}/${thana}`);
  return found.id;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

async function shopper(shop: ShopClient, thana = 'Mirpur', zilla = 'Dhaka') {
  return {
    customerName: 'Rahima Akter',
    phone: freshMobile(),
    locationId: await thanaId(shop, zilla, thana),
    deliveryAddress: 'House 12, Road 3',
  };
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  stock: number,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: stock }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

async function ordersOf(shop: ShopClient): Promise<number> {
  return ((await shop.get('/orders')).body as { total: number }).total;
}

async function orderIdOf(trackingId: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.orders WHERE tracking_id = $1',
    [trackingId],
  );
  return rows[0]?.id ?? '';
}

describeIfDatabase('what a product asks when ordering (ATR-08, Slice 4.8e)', () => {
  it('lists it on the public product, keeps the answer, and tracking shows it back', async () => {
    const shop = await openShop(port, texts, 'po');
    const text = await shop.post('/attributes', { name: 'Message', dataType: 'text' });
    expect(text.status, JSON.stringify(text.body)).toBe(201);
    const asked = (text.body as { id: string }).id;
    const cake = await product(shop, 'Cake', 1500, 3, {
      attributes: [{ attributeId: asked, role: 'captured_at_order' }],
    });
    const plain = await product(shop, 'Candle', 100, 3);
    const sf = await storefrontKey(shop);
    const read = async (id: string) => {
      const { slug } = (await shop.get(`/products/${id}`)).body as { slug: string };
      return call(sf, 'GET', `/v1/catalogue/products/${slug}`, undefined);
    };
    expect((await read(cake.id)).body).toMatchObject({
      asked: [{ attributeId: asked, name: 'Message', dataType: 'text' }],
    });
    expect((await read(plain.id)).body).toMatchObject({ asked: [] });

    const made = await placed(sf, {
      ...(await shopper(shop)),
      items: [
        {
          variantId: cake.variantId,
          quantity: 1,
          captured: [{ attributeId: asked, value: 'Rafi' }],
        },
        { variantId: plain.variantId, quantity: 1 },
      ],
    });
    const tracked = await track(sf, made.trackingId);
    expect(tracked.status, JSON.stringify(tracked.body)).toBe(200);
    expect(tracked.body).toMatchObject({
      items: [
        { captured: [{ name: 'Message', value: 'Rafi' }], components: [] },
        { captured: [], components: [] },
      ],
    });
    // Never what only the shop holds: no attribute's id, as staff's order view has.
    expect(JSON.stringify(tracked.body)).not.toContain(asked);
  });
});

describeIfDatabase('a shopper places an order (ORD-02, ORD-07, CCH-07, PRD-07)', () => {
  it('makes it pending through the storefront, priced from the database, holding its stock, its customer made', async () => {
    const shop = await openShop(port, texts, 'po');
    const shirt = await product(shop, 'Shirt', 500, 3);
    const sf = await storefrontKey(shop);
    const who = await shopper(shop);
    const made = await placed(sf, {
      ...who,
      shopperNote: 'Call before coming',
      items: [{ variantId: shirt.variantId, quantity: 2 }],
    });
    expect(made).toMatchObject({
      status: 'pending',
      subtotal: '1000.00',
      deliveryCharge: '70.00',
      grandTotal: '1070.00',
      codAmount: '1070.00',
      items: [
        {
          variantId: shirt.variantId,
          productName: 'Shirt',
          quantity: '2.000',
          itemTotal: '1000.00',
        },
      ],
    });
    expect(made.orderNumber).toMatch(/^\d{6}-\d{4}$/);
    expect(made.trackingId).toMatch(/^[23456789A-HJ-NP-Z]{8}$/);
    expect(made.purchaseEventId).toBe(`purchase.${made.trackingId}`);
    const id = await orderIdOf(made.trackingId);
    const staffView = (await shop.get(`/orders/${id}`)).body as Record<string, unknown>;
    expect(staffView).toMatchObject({
      source: 'storefront',
      status: 'pending',
      customerPhone: who.phone,
      shopperNote: 'Call before coming',
      notes: null,
      createdBy: null,
    });
    const { rows } = await admin.query<{
      shopper_note: string;
      created_by: string | null;
      notes: string | null;
    }>('SELECT shopper_note, created_by, notes FROM tenant.orders WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ shopper_note: 'Call before coming', created_by: null, notes: null });
    // PRD-07: two of three are held, so a second shopper cannot have two more.
    const short = await order(sf, {
      ...(await shopper(shop)),
      items: [{ variantId: shirt.variantId, quantity: 2 }],
    });
    expect(short.status).toBe(409);
    expect(errorOf(short).code).toBe('conflict');
    const customers = await admin.query<{ name: string }>(
      'SELECT name FROM tenant.customers WHERE tenant_id = $1 AND phone = $2',
      [shop.tenantId, who.phone],
    );
    expect(customers.rows).toEqual([{ name: 'Rahima Akter' }]);
  });

  it("names its source: the storefront's or a landing page's, the API's for the shop's own key, which may not say otherwise", async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const sf = await storefrontKey(shop);
    const own = await ownKey(shop);
    const items = [{ variantId: lamp.variantId, quantity: 1 }];
    const landing = await placed(sf, { ...(await shopper(shop)), source: 'landing_page', items });
    const api = await placed(own, { ...(await shopper(shop)), items });
    const sources = await admin.query<{ tracking_id: string; source: string }>(
      'SELECT tracking_id, source FROM tenant.orders WHERE tracking_id = ANY($1)',
      [[landing.trackingId, api.trackingId]],
    );
    expect(Object.fromEntries(sources.rows.map((row) => [row.tracking_id, row.source]))).toEqual({
      [landing.trackingId]: 'landing_page',
      [api.trackingId]: 'api',
    });
    const claimed = await order(own, { ...(await shopper(shop)), source: 'storefront', items });
    expect(claimed.status).toBe(400);
    expect(fieldsOf(claimed)).toEqual({ source: 'not_allowed' });
  });

  it('refuses a price, discount, delivery charge, status or another order type by name', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const own = await ownKey(shop);
    const refused = await order(own, {
      ...(await shopper(shop)),
      discount: 50,
      deliveryCharge: 0,
      status: 'confirmed',
      // ORD-40: neither axis is a shopper's to set.
      paymentStatus: 'paid',
      fulfillmentStatus: 'delivered',
      fulfilmentType: 'takeaway',
      items: [{ variantId: lamp.variantId, quantity: 1, unitPrice: 1 }],
    });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toEqual({
      discount: 'not_allowed',
      deliveryCharge: 'not_allowed',
      status: 'not_allowed',
      paymentStatus: 'not_allowed',
      fulfillmentStatus: 'not_allowed',
      fulfilmentType: 'not_allowed',
      'items.0.unitPrice': 'not_allowed',
    });
    expect(await ordersOf(shop)).toBe(0);
  });
});

describeIfDatabase(
  'what a shopper may not order is refused, naming it (PRD-06, ATR-07, D4-2, DLV-06, DLV-07)',
  () => {
    it("refuses a product not on sale, one needing an advance the shop can't take, a bare product id and one sold out; nothing is made", async () => {
      const shop = await openShop(port, texts, 'po');
      const own = await ownKey(shop);
      const who = await shopper(shop);
      const soap = await product(shop, 'Soap', 100, 5);
      expect((await shop.patch(`/products/${soap.id}`, { active: false })).status).toBe(200);
      const hidden = await order(own, {
        ...who,
        items: [{ variantId: soap.variantId, quantity: 1 }],
      });
      expect(hidden.status).toBe(409);
      expect(errorOf(hidden)).toMatchObject({
        code: 'conflict',
        details: { reason: 'product_unavailable', productId: soap.id },
      });
      expect(errorOf(hidden).message).toContain('Soap');
      const phone = await product(shop, 'Phone', 15000, 5, {
        paymentPolicy: 'partial_advance',
        advanceAmount: 300,
      });
      const advance = await order(own, {
        ...who,
        items: [{ variantId: phone.variantId, quantity: 1 }],
      });
      // Phase 5 Slice 5.2: an advance is paid online; this shop takes no payments yet (WAL-08).
      expect(advance.status).toBe(409);
      expect(errorOf(advance)).toMatchObject({ details: { reason: 'no_payment_method' } });
      const lamp = await product(shop, 'Lamp', 300, 1);
      const bare = await order(own, { ...who, items: [{ variantId: lamp.id, quantity: 1 }] });
      expect(bare.status).toBe(400);
      expect(fieldsOf(bare)).toEqual({ 'items.0.variantId': 'not_found' });
      // SEC-02: another shop's variant is not this key's to order.
      const other = await openShop(port, texts, 'po');
      const theirs = await product(other, 'Theirs', 100, 5);
      const crossed = await order(own, {
        ...who,
        items: [{ variantId: theirs.variantId, quantity: 1 }],
      });
      expect(crossed.status).toBe(400);
      expect(fieldsOf(crossed)).toEqual({ 'items.0.variantId': 'not_found' });
      const soldOut = await order(own, {
        ...who,
        items: [{ variantId: lamp.variantId, quantity: 2 }],
      });
      expect(soldOut.status).toBe(409);
      expect(errorOf(soldOut).message).toContain('Lamp');
      expect(await ordersOf(shop)).toBe(0);
    });

    it('refuses an address the shop does not deliver to, and a product limited to other zones', async () => {
      const shop = await openShop(port, texts, 'po');
      const own = await ownKey(shop);
      const zones = (await shop.get('/delivery-zones')).body as {
        zones: { id: string; isHome: boolean; isFallback: boolean }[];
      };
      const home = zones.zones.find((zone) => zone.isHome)?.id ?? '';
      const outside = zones.zones.find((zone) => zone.isFallback)?.id ?? '';
      const fish = await product(shop, 'Frozen fish', 700, 5);
      expect(
        (await shop.put(`/products/${fish.id}/delivery-zones`, { zoneIds: [home] })).status,
      ).toBe(200);
      const rajshahi = await shopper(shop, 'Rajpara', 'Rajshahi');
      const limited = await order(own, {
        ...rajshahi,
        items: [{ variantId: fish.variantId, quantity: 1 }],
      });
      expect(limited.status).toBe(409);
      expect(errorOf(limited)).toMatchObject({ details: { reason: 'product_not_delivered_here' } });
      expect(errorOf(limited).message).toContain('Frozen fish');
      const mirpur = await placed(own, {
        ...(await shopper(shop)),
        items: [{ variantId: fish.variantId, quantity: 1 }],
      });
      expect(mirpur.status).toBe('pending');
      expect((await shop.patch(`/delivery-zones/${outside}`, { noDelivery: true })).status).toBe(
        200,
      );
      const rice = await product(shop, 'Rice', 80, 5);
      const away = await order(own, {
        ...rajshahi,
        items: [{ variantId: rice.variantId, quantity: 1 }],
      });
      expect(away.status).toBe(409);
      expect(errorOf(away)).toMatchObject({ details: { reason: 'zone_no_delivery' } });
      expect(await ordersOf(shop)).toBe(1);
    });

    it('refuses a limited product where it accepts one with no limit, in the same zone (DLV-07)', async () => {
      const shop = await openShop(port, texts, 'po');
      const own = await ownKey(shop);
      const zones = (await shop.get('/delivery-zones')).body as {
        zones: { id: string; isHome: boolean }[];
      };
      const home = zones.zones.find((zone) => zone.isHome)?.id ?? '';
      const fish = await product(shop, 'Frozen fish', 700, 5, { deliveryZoneIds: [home] });
      const rice = await product(shop, 'Rice', 80, 5);
      const chattogram = await shopper(shop, 'Panchlaish', 'Chattogram');
      const limited = await order(own, {
        ...chattogram,
        items: [{ variantId: fish.variantId, quantity: 1 }],
      });
      expect(limited.status).toBe(409);
      expect(errorOf(limited)).toMatchObject({ details: { reason: 'product_not_delivered_here' } });
      expect(errorOf(limited).message).toContain('Frozen fish');
      const both = await order(own, {
        ...chattogram,
        items: [
          { variantId: rice.variantId, quantity: 1 },
          { variantId: fish.variantId, quantity: 1 },
        ],
      });
      expect(both.status).toBe(409);
      expect(errorOf(both).message).toContain('Frozen fish');
      expect(await ordersOf(shop)).toBe(0);
      const accepted = await placed(own, {
        ...chattogram,
        items: [{ variantId: rice.variantId, quantity: 1 }],
      });
      expect(accepted).toMatchObject({ status: 'pending', deliveryCharge: '130.00' });
    });

    it('limits a combo to what every part allows, as a shopper sees it and an order is refused (DLV-07)', async () => {
      const shop = await openShop(port, texts, 'po');
      const own = await ownKey(shop);
      const zones = (await shop.get('/delivery-zones')).body as {
        zones: { id: string; isHome: boolean }[];
      };
      const home = zones.zones.find((zone) => zone.isHome)?.id ?? '';
      const far = zones.zones.find((zone) => !zone.isHome)?.id ?? '';
      const fish = await product(shop, 'Frozen fish', 700, 5, { deliveryZoneIds: [home] });
      const rice = await product(shop, 'Rice', 80, 5);
      const made = await shop.post('/products', {
        name: 'Dinner pack',
        basePrice: 750,
        kind: 'combo',
        parts: [
          { quantity: 1, variantIds: [fish.variantId] },
          { quantity: 1, variantIds: [rice.variantId] },
        ],
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const pack = made.body as { slug: string; variants: { id: string }[] };
      const variantId = pack.variants[0]?.id ?? '';

      const page = await call(own, 'GET', `/v1/catalogue/products/${pack.slug}`, undefined);
      expect(page.body).toMatchObject({ deliveryZoneIds: [home] });
      // The editor still shows what was set on the combo itself.
      const edited = await shop.get(`/products/${(made.body as { id: string }).id}`);
      expect(edited.body).toMatchObject({ deliveryZoneIds: [] });

      const chattogram = await shopper(shop, 'Panchlaish', 'Chattogram');
      const items = [{ variantId, quantity: 1 }];
      const seen = await call(own, 'POST', '/v1/delivery-estimate', {
        locationId: chattogram.locationId,
        items,
      });
      expect(seen.body).toMatchObject({ deliverable: false, notDeliveredHere: ['Dinner pack'] });
      const refused = await order(own, { ...chattogram, items });
      expect(refused.status).toBe(409);
      expect(errorOf(refused)).toMatchObject({ details: { reason: 'product_not_delivered_here' } });
      expect(errorOf(refused).message).toContain('Dinner pack');
      expect(await ordersOf(shop)).toBe(0);
      // Where the fish can go, the pack can.
      const accepted = await placed(own, { ...(await shopper(shop)), items });
      expect(accepted.status).toBe('pending');

      // Parts that share no zone leave it nowhere to go.
      const stranded = await shop.post('/products', {
        name: 'Stranded pack',
        basePrice: 750,
        kind: 'combo',
        parts: [
          { quantity: 1, variantIds: [fish.variantId] },
          {
            quantity: 1,
            variantIds: [
              (await product(shop, 'Far tea', 80, 5, { deliveryZoneIds: [far] })).variantId,
            ],
          },
        ],
      });
      expect(stranded.status, JSON.stringify(stranded.body)).toBe(201);
      const nowhere = await order(own, {
        ...(await shopper(shop)),
        items: [
          {
            variantId: (stranded.body as { variants: { id: string }[] }).variants[0]?.id,
            quantity: 1,
          },
        ],
      });
      expect(nowhere.status).toBe(409);
      expect(errorOf(nowhere).message).toContain('Stranded pack');
    });

    it('refuses a form with an unknown thana, no phone or no address, by its field; nothing is made (LND-07)', async () => {
      const shop = await openShop(port, texts, 'po');
      const lamp = await product(shop, 'Lamp', 300, 5);
      const sf = await storefrontKey(shop);
      const form = {
        ...(await shopper(shop)),
        source: 'landing_page',
        items: [{ variantId: lamp.variantId, quantity: 1 }],
      };
      const unknown = await order(sf, { ...form, locationId: 999_999 });
      expect(unknown.status).toBe(400);
      expect(fieldsOf(unknown)).toEqual({ locationId: 'not_found' });
      const noPhone = await order(sf, { ...form, phone: undefined });
      expect(noPhone.status).toBe(400);
      expect(fieldsOf(noPhone)).toEqual({ phone: 'required' });
      const noAddress = await order(sf, { ...form, deliveryAddress: undefined });
      expect(noAddress.status).toBe(400);
      expect(fieldsOf(noAddress)).toEqual({ deliveryAddress: 'required' });
      expect(await ordersOf(shop)).toBe(0);
      // The same form with all three is taken.
      expect((await placed(sf, form)).status).toBe('pending');
    });
  },
);

describeIfDatabase(
  'once per Idempotency-Key; staff told once; audited by the key (ORD-21, ORD-20, API-21)',
  () => {
    it('needs the key, replays the same order for it, and refuses it with other data', async () => {
      const shop = await openShop(port, texts, 'po');
      const lamp = await product(shop, 'Lamp', 300, 10);
      const own = await ownKey(shop);
      const body = {
        ...(await shopper(shop)),
        items: [{ variantId: lamp.variantId, quantity: 1 }],
      };
      const missing = await order(own, body, null);
      expect(missing.status).toBe(400);
      expect(errorOf(missing).code).toBe('idempotency_key_required');
      const key = randomUUID();
      const first = await order(own, body, key);
      const again = await order(own, body, key);
      expect(first.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect((again.body as Placed).orderNumber).toBe((first.body as Placed).orderNumber);
      const other = await order(
        own,
        { ...body, items: [{ variantId: lamp.variantId, quantity: 2 }] },
        key,
      );
      expect(other.status).toBe(422);
      expect(await ordersOf(shop)).toBe(1);
      expect(notices.sent).toHaveLength(1);
    });

    it("tells staff of a shopper's order once, and never of one staff entered", async () => {
      const shop = await openShop(port, texts, 'po');
      const lamp = await product(shop, 'Lamp', 300, 10);
      const sf = await storefrontKey(shop);
      const made = await placed(sf, {
        ...(await shopper(shop)),
        items: [{ variantId: lamp.variantId, quantity: 1 }],
      });
      expect(notices.sent).toEqual([
        expect.objectContaining({
          tenantId: shop.tenantId,
          orderNumber: made.orderNumber,
          source: 'storefront',
          grandTotal: '370.00',
        }),
      ]);
      const staff = await postJson(
        port,
        '/orders',
        { ...(await shopper(shop)), items: [{ variantId: lamp.variantId, quantity: 1 }] },
        shop.headers({ 'idempotency-key': randomUUID() }),
      );
      expect(staff.status).toBe(201);
      expect(notices.sent).toHaveLength(1);
    });

    it("writes the order to the activity log by the key's name, never its value", async () => {
      const shop = await openShop(port, texts, 'po');
      const lamp = await product(shop, 'Lamp', 300, 10);
      const own = await ownKey(shop);
      const made = await placed(own, {
        ...(await shopper(shop)),
        items: [{ variantId: lamp.variantId, quantity: 1 }],
      });
      const { rows } = await admin.query<{
        actor_type: string;
        actor_id: string;
        summary: Record<string, unknown>;
      }>(
        `SELECT actor_type, actor_id, summary FROM tenant.activity_log
       WHERE tenant_id = $1 AND action = 'order_created'`,
        [shop.tenantId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_type: 'api_key',
        summary: { orderNumber: made.orderNumber, keyName: 'Website', source: 'api' },
      });
      expect(JSON.stringify(rows)).not.toContain(own.key);
    });
  },
);

describeIfDatabase('the per-minute windows on orders (RTE-06, RTE-08, LND-12)', () => {
  it('holds one visitor to 10 orders a minute; another visitor still orders', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 50);
    const own = await ownKey(shop);
    const body = async () => ({
      ...(await shopper(shop)),
      items: [{ variantId: lamp.variantId, quantity: 1 }],
    });
    for (let index = 0; index < 10; index += 1) {
      expect((await order(own, await body(), randomUUID(), '198.51.100.1')).status).toBe(201);
    }
    const eleventh = await order(own, await body(), randomUUID(), '198.51.100.1');
    expect(eleventh.status).toBe(429);
    expect(errorOf(eleventh).code).toBe('rate_limited');
    expect(eleventh.headers['retry-after']).toBeDefined();
    expect((await order(own, await body(), randomUUID(), '198.51.100.2')).status).toBe(201);
  });

  it("holds the shop's shoppers together to the operator's figure, the same on every plan, and counts what it refuses", async () => {
    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.PublicOrdersPerShopPerMinute, 3, randomUUID());
    try {
      // A shop on each plan, so longer than the default limit on a busy machine. Each moves to its plan after its product
      // is made: on pay-as-you-go a new product is itself charged for.
      for (const [plan, state] of [
        ['Trial', 'trial'],
        ['Starter', 'active'],
        ['Pay-as-you-go', 'pay_as_you_go'],
      ] as const) {
        const shop = await openShop(port, texts, 'po');
        const lamp = await product(shop, 'Lamp', 300, 50);
        const own = await ownKey(shop);
        await admin.query(
          `UPDATE control.tenants SET state = $2,
             plan_id = (SELECT id FROM control.plans WHERE name = $3),
             plan_snapshot = (SELECT limits FROM control.plans WHERE name = $3)
           WHERE id = $1`,
          [shop.tenantId, state, plan],
        );
        const from = async (visitor: string) =>
          order(
            own,
            { ...(await shopper(shop)), items: [{ variantId: lamp.variantId, quantity: 1 }] },
            randomUUID(),
            visitor,
          );
        for (const visitor of ['198.51.100.11', '198.51.100.12', '198.51.100.13']) {
          expect((await from(visitor)).status, plan).toBe(201);
        }
        expect((await from('198.51.100.14')).status, plan).toBe(429);
        await app.get(RequestQuota).flush();
        const { rows } = await admin.query<{ refused_orders: number }>(
          'SELECT refused_orders FROM control.api_usage WHERE tenant_id = $1',
          [shop.tenantId],
        );
        expect(
          rows.map((row) => row.refused_orders),
          plan,
        ).toEqual([1]);
      }
    } finally {
      await settings.set(PlatformSettingKey.PublicOrdersPerShopPerMinute, 60, randomUUID());
    }
  }, 60_000);
});

describeIfDatabase("orders past the month's requests (QTA-07, RTE-03, agreed 2026-11-04)", () => {
  it('still takes an order and answers what checkout reads, counting them, while the rest stops', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const sf = await storefrontKey(shop);
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'requests_monthly', 2, 'request stop test', randomUUID());
    const quota = app.get(RequestQuota);
    let browsing = await call(sf, 'GET', '/v1/shop', undefined);
    for (let tries = 0; tries < 10 && browsing.status === 200; tries += 1) {
      await quota.flush();
      browsing = await call(sf, 'GET', '/v1/shop', undefined);
    }
    expect(browsing.status).toBe(429);
    expect(errorOf(browsing).code).toBe('quota_exceeded');
    const { rows: before } = await admin.query<{ requests: string }>(
      'SELECT coalesce(sum(requests), 0)::text AS requests FROM control.api_usage WHERE tenant_id = $1',
      [shop.tenantId],
    );

    const who = await shopper(shop);
    const items = [{ variantId: lamp.variantId, quantity: 1 }];
    expect((await call(sf, 'GET', '/v1/locations', undefined)).status).toBe(200);
    const seen = await call(sf, 'POST', '/v1/delivery-estimate', {
      locationId: who.locationId,
      items,
    });
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);
    expect((await placed(sf, { ...who, items })).status).toBe('pending');
    expect(await ordersOf(shop)).toBe(1);

    // They count, and everything else is still stopped.
    await quota.flush();
    const { rows: after } = await admin.query<{ requests: string }>(
      'SELECT coalesce(sum(requests), 0)::text AS requests FROM control.api_usage WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(Number(after[0]?.requests)).toBeGreaterThanOrEqual(Number(before[0]?.requests) + 3);
    expect((await call(sf, 'GET', '/v1/shop', undefined)).status).toBe(429);
  });
});

describeIfDatabase('the shopper path (PHASE-4-PLAN §1, exit criterion 3)', () => {
  it.each([
    ['the storefront', {}, 'storefront'],
    ['a landing page', { source: 'landing_page' }, 'landing_page'],
  ])(
    'an order from %s, submitted twice, is one order at the price shown, tracked with no address or phone',
    async (_from, claimed, source) => {
      const shop = await openShop(port, texts, 'po');
      const shirt = await product(shop, 'Shirt', 500, 5);
      const sf = await storefrontKey(shop);
      const who = await shopper(shop);
      const items = [{ variantId: shirt.variantId, quantity: 2 }];

      // What the cart and the order form show, from the read each of them makes.
      const shown = await call(sf, 'POST', '/v1/delivery-estimate', {
        locationId: who.locationId,
        items,
      });
      expect(shown.status, JSON.stringify(shown.body)).toBe(200);
      expect(shown.body).toMatchObject({ subtotal: '1000.00', deliveryCharge: '70.00' });

      const body = { ...who, ...claimed, items };
      const key = randomUUID();
      const first = await order(sf, body, key);
      const again = await order(sf, body, key);
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(again.status, JSON.stringify(again.body)).toBe(201);
      expect(again.headers['idempotent-replay']).toBe('true');
      const made = first.body as Placed;
      expect((again.body as Placed).orderNumber).toBe(made.orderNumber);
      expect(made).toMatchObject({
        subtotal: '1000.00',
        deliveryCharge: '70.00',
        grandTotal: '1070.00',
        codAmount: '1070.00',
      });
      expect(await ordersOf(shop)).toBe(1);
      const id = await orderIdOf(made.trackingId);
      expect((await shop.get(`/orders/${id}`)).body).toMatchObject({
        source,
        grandTotal: '1070.00',
      });
      const stock = (await shop.get(`/products/${shirt.id}/stock`)).body as {
        variants: { reserved: string }[];
      };
      expect(stock.variants[0]?.reserved).toBe('2.000');

      // A double tap, both on their way at once, is still one order.
      const tapped = {
        ...(await shopper(shop)),
        ...claimed,
        items: [{ ...items[0], quantity: 1 }],
      };
      const tap = randomUUID();
      const taps = await Promise.all([order(sf, tapped, tap), order(sf, tapped, tap)]);
      expect(taps.map((tapResult) => tapResult.status)).toContain(201);
      expect(await ordersOf(shop)).toBe(2);

      const tracked = await track(sf, made.trackingId);
      expect(tracked.status, JSON.stringify(tracked.body)).toBe(200);
      expect(tracked.body).toMatchObject({ status: 'pending', grandTotal: '1070.00' });
      const page = JSON.stringify(tracked.body);
      expect(page).not.toContain(who.phone);
      expect(page).not.toContain(who.deliveryAddress);
      expect(page).not.toContain(who.customerName);
    },
  );

  it("makes the same order through the storefront's key and the shop's own, but for its source and identifiers (SFT-06)", async () => {
    const shop = await openShop(port, texts, 'po');
    const shirt = await product(shop, 'Shirt', 500, 5);
    const sf = await storefrontKey(shop);
    const own = await ownKey(shop);
    const body = {
      ...(await shopper(shop)),
      shopperNote: 'Call before coming',
      items: [{ variantId: shirt.variantId, quantity: 2 }],
    };
    const fromSite = await placed(sf, body);
    const fromApi = await placed(own, body);
    const ids = [await orderIdOf(fromSite.trackingId), await orderIdOf(fromApi.trackingId)];

    // What makes each order itself: who it is, where it came from and when. Everything else is the same.
    const OWN = new Set([
      'id',
      'order_id',
      'orderNumber',
      'order_number',
      'trackingId',
      'tracking_id',
      'purchaseEventId',
      'source',
      'createdAt',
      'created_at',
      'updatedAt',
      'updated_at',
      'at',
    ]);
    const shared = (value: unknown): unknown =>
      JSON.parse(
        JSON.stringify(value, (key, field: unknown) => (OWN.has(key) ? undefined : field)),
      );

    expect(shared(fromSite)).toEqual(shared(fromApi));
    const [siteView, apiView] = await Promise.all(ids.map((id) => shop.get(`/orders/${id}`)));
    expect(siteView?.body).toMatchObject({ source: 'storefront' });
    expect(apiView?.body).toMatchObject({ source: 'api' });
    expect(shared(siteView?.body)).toEqual(shared(apiView?.body));
    // In the order list too.
    const { orders } = (await shop.get('/orders')).body as {
      orders: { id: string; source: string }[];
    };
    const inList = ids.map((id) => orders.find((row) => row.id === id));
    expect(inList.map((row) => row?.source)).toEqual(['storefront', 'api']);
    expect(shared(inList[0])).toEqual(shared(inList[1]));
    // And as stored, order and items.
    const stored = async (table: string, column: string) => {
      const { rows } = await admin.query<{ row: Record<string, unknown> }>(
        `SELECT to_jsonb(t) AS row FROM ${table} t WHERE ${column} = ANY($1)`,
        [ids],
      );
      expect(rows).toHaveLength(2);
      return rows.map(({ row }) => shared(row));
    };
    const [firstRow, secondRow] = await stored('tenant.orders', 'id');
    expect(firstRow).toEqual(secondRow);
    const [firstLine, secondLine] = await stored('tenant.order_lines', 'order_id');
    expect(firstLine).toEqual(secondLine);
  });
});

describeIfDatabase('a public order is taken whatever the shop has handled or holds', () => {
  it('still takes one with every handling limit used up (QTA-07)', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const sf = await storefrontKey(shop);
    const overrides = app.get(PlanLimitOverridesService);
    for (const limit of ['orders_total', 'orders_handled_monthly', 'orders_handled_daily']) {
      await overrides.set(shop.tenantId, limit, 1, 'handling limit test', randomUUID());
    }
    const items = [{ variantId: lamp.variantId, quantity: 1 }];
    const send = async (made: Placed) =>
      shop.post(`/orders/${await orderIdOf(made.trackingId)}/ship`, {
        courierName: 'Steadfast',
        trackingCode: 'SF-1',
      });
    const first = await placed(sf, { ...(await shopper(shop)), items });
    expect((await send(first)).status).toBe(200);
    const next = await placed(sf, { ...(await shopper(shop)), items });
    expect(next.status).toBe('pending');
    const refused = await send(next);
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');
    expect((await placed(sf, { ...(await shopper(shop)), items })).status).toBe('pending');
  });

  it('takes one on pay-as-you-go with nothing in the balance, and asks for it only at sending (PYG-03)', async () => {
    const shop = await openShop(port, texts, 'po');
    // Made on the trial: on pay-as-you-go a new product is itself charged for.
    const lamp = await product(shop, 'Lamp', 300, 5);
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go',
         plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
         plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
       WHERE id = $1`,
      [shop.tenantId],
    );
    const ledger = async () =>
      (
        await admin.query<{ id: string }>(
          'SELECT id FROM tenant.balance_ledger WHERE tenant_id = $1',
          [shop.tenantId],
        )
      ).rows;
    expect(await ledger()).toEqual([]);
    const made = await placed(await storefrontKey(shop), {
      ...(await shopper(shop)),
      items: [{ variantId: lamp.variantId, quantity: 1 }],
    });
    expect(made.status).toBe('pending');
    expect(await ledger()).toEqual([]);
    const id = await orderIdOf(made.trackingId);
    const refused = await shop.post(`/orders/${id}/ship`, {
      courierName: 'Steadfast',
      trackingCode: 'SF-1',
    });
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('quota_exceeded');
    expect((await shop.get(`/orders/${id}`)).body).toMatchObject({
      status: 'pending',
      handledAt: null,
    });
  });

  it('sends a guest no SMS and makes no account (CUS-07)', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const sf = await storefrontKey(shop);
    const who = await shopper(shop);
    const queued = async () => {
      const { rows } = await admin.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM control.sms_outbox',
      );
      return rows[0]?.total;
    };
    const [sentBefore, queuedBefore] = [texts.sent.length, await queued()];
    await placed(sf, { ...who, items: [{ variantId: lamp.variantId, quantity: 1 }] });
    expect(texts.sent.length).toBe(sentBefore);
    expect(texts.countFor(who.phone)).toBe(0);
    expect(await queued()).toBe(queuedBefore);
    const accounts = await admin.query(
      'SELECT id FROM tenant.shoppers WHERE tenant_id = $1 AND phone = $2',
      [shop.tenantId, who.phone],
    );
    expect(accounts.rows).toEqual([]);
  });

  it("finds a landing page's order in the list by its source, and none of the others (LND-09)", async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const sf = await storefrontKey(shop);
    const own = await ownKey(shop);
    const items = [{ variantId: lamp.variantId, quantity: 1 }];
    const landing = await placed(sf, { ...(await shopper(shop)), source: 'landing_page', items });
    await placed(sf, { ...(await shopper(shop)), items });
    await placed(own, { ...(await shopper(shop)), items });
    const staff = await postJson(
      port,
      '/orders',
      { ...(await shopper(shop)), items },
      shop.headers({ 'idempotency-key': randomUUID() }),
    );
    expect(staff.status).toBe(201);
    const found = await shop.get('/orders?source=landing_page');
    expect(found.status, JSON.stringify(found.body)).toBe(200);
    const list = found.body as { orders: { orderNumber: string; source: string }[]; total: number };
    expect(list.total).toBe(1);
    expect(list.orders.map((row) => [row.orderNumber, row.source])).toEqual([
      [landing.orderNumber, 'landing_page'],
    ]);
    expect(await ordersOf(shop)).toBe(4);
  });

  it('orders at the price in the database, with an older one still in the catalogue cache (LND-13, CCH-07)', async () => {
    const shop = await openShop(port, texts, 'po');
    const shirt = await product(shop, 'Shirt', 500, 10);
    const sf = await storefrontKey(shop);
    const { slug } = (await shop.get(`/products/${shirt.id}`)).body as { slug: string };
    const cataloguePrice = async () => {
      const read = await call(sf, 'GET', `/v1/catalogue/products/${slug}`, undefined);
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      return (read.body as { variants: { price: string }[] }).variants[0]?.price;
    };
    expect(await cataloguePrice()).toBe('500.00');
    // Written past the catalogue's versions, so the cache cannot know: the answer it holds is now stale.
    await admin.query('UPDATE tenant.products SET base_price = 650 WHERE id = $1', [shirt.id]);
    expect(await cataloguePrice()).toBe('500.00');
    const who = await shopper(shop);
    const items = [{ variantId: shirt.variantId, quantity: 2 }];
    // CCH-07: what the shopper is shown at checkout is the corrected price.
    const shown = await call(sf, 'POST', '/v1/delivery-estimate', {
      locationId: who.locationId,
      items,
    });
    expect(shown.body).toMatchObject({ subtotal: '1300.00' });
    const stale = await placed(sf, { ...who, source: 'landing_page', items });
    expect(stale).toMatchObject({
      subtotal: '1300.00',
      grandTotal: '1370.00',
      items: [{ itemTotal: '1300.00' }],
    });
    // A price changed the way the shop changes it reaches the very next order.
    expect((await shop.patch(`/products/${shirt.id}`, { basePrice: 700 })).status).toBe(200);
    const edited = await placed(sf, { ...(await shopper(shop)), source: 'landing_page', items });
    expect(edited).toMatchObject({ subtotal: '1400.00', grandTotal: '1470.00' });
    // CCH-07: neither an order nor its tracking invites a shared cache to keep it.
    const made = await order(sf, { ...(await shopper(shop)), items });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    for (const answer of [made, await track(sf, (made.body as Placed).trackingId)]) {
      expect(String(answer.headers['cache-control'] ?? '')).not.toMatch(/public|s-maxage/);
    }
  });
});

describeIfDatabase('tracking by ID (ORD-17, SFT-08)', () => {
  it('shows status, timeline, items and totals, never the address or phone, and the courier once shipped', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const sf = await storefrontKey(shop);
    const who = await shopper(shop);
    const made = await placed(sf, { ...who, items: [{ variantId: lamp.variantId, quantity: 2 }] });
    const first = await track(sf, made.trackingId.toLowerCase());
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({
      orderNumber: made.orderNumber,
      status: 'pending',
      timeline: [{ step: 'placed' }],
      items: [{ productName: 'Lamp', quantity: '2.000' }],
      grandTotal: '670.00',
      courier: null,
    });
    const text = JSON.stringify(first.body);
    expect(text).not.toContain(who.phone);
    expect(text).not.toContain(who.deliveryAddress);
    const id = await orderIdOf(made.trackingId);
    // A hold is the shop's own: the shopper still sees the status under it.
    expect((await shop.post(`/orders/${id}/override`, { override: 'hold' })).status).toBe(200);
    expect(((await track(sf, made.trackingId)).body as Tracked).status).toBe('pending');
    // A courier booked before the order ships is not the shopper's to see yet.
    await admin.query(
      `UPDATE tenant.orders SET status_override = NULL, confirmed_at = now(), courier_name = 'Steadfast',
         tracking_code = 'SF123', tracking_link = 'https://steadfast.com.bd/t/SF123'
       WHERE id = $1`,
      [id],
    );
    const booked = (await track(sf, made.trackingId)).body as Tracked;
    expect(booked).toMatchObject({ status: 'confirmed', courier: null });
    await admin.query(
      `UPDATE tenant.orders SET fulfillment_status = 'shipped', shipped_at = now() WHERE id = $1`,
      [id],
    );
    const shipped = (await track(sf, made.trackingId)).body as Tracked;
    expect(shipped.status).toBe('shipped');
    expect(shipped.timeline.map((step) => step.step)).toEqual(['placed', 'confirmed', 'shipped']);
    expect(shipped.courier).toEqual({
      name: 'Steadfast',
      trackingCode: 'SF123',
      trackingLink: 'https://steadfast.com.bd/t/SF123',
    });
  });

  it("shows a cancellation, and answers not found for an unknown ID or another shop's order", async () => {
    const shop = await openShop(port, texts, 'po');
    const other = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const sf = await storefrontKey(shop);
    const theirs = await storefrontKey(other);
    const made = await placed(sf, {
      ...(await shopper(shop)),
      items: [{ variantId: lamp.variantId, quantity: 1 }],
    });
    const id = await orderIdOf(made.trackingId);
    expect((await shop.post(`/orders/${id}/cancel`, { reason: 'customer_cancelled' })).status).toBe(
      200,
    );
    const cancelled = (await track(sf, made.trackingId)).body as Tracked;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.timeline.map((step) => step.step)).toEqual(['placed', 'cancelled']);
    expect((await track(theirs, made.trackingId)).status).toBe(404);
    expect((await track(sf, 'ZZZZ2222')).status).toBe(404);
    expect((await track(sf, 'not-an-id')).status).toBe(404);
  });

  it('still shows the name, values, price and totals it was ordered at after the product is renamed and deleted for good (ORD-46)', async () => {
    const shop = await openShop(port, texts, 'po');
    const attributes = (await shop.get('/attributes')).body as {
      id: string;
      name: string;
      scope: string;
    }[];
    const colour =
      attributes.find((row) => row.name === 'Color' && row.scope === 'platform')?.id ?? '';
    const options = await shop.post(`/attributes/${colour}/options/batch`, { values: ['Red'] });
    const red = (options.body as { id: string }[])[0]?.id ?? '';
    const made = await shop.post('/products', {
      name: 'Lamp',
      basePrice: 300,
      stockTracking: 'not_tracked',
      variantAttributes: [{ attributeId: colour, optionIds: [red] }],
      variants: [{ optionIds: [red] }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const lamp = made.body as { id: string; variants: { id: string }[] };
    const sf = await storefrontKey(shop);
    const ordered = await placed(sf, {
      ...(await shopper(shop)),
      items: [{ variantId: lamp.variants[0]?.id, quantity: 2 }],
    });
    const renamed = await shop.patch(`/products/${lamp.id}`, { name: 'Desk lamp', basePrice: 450 });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect((await shop.delete(`/products/${lamp.id}?hard=true`)).status).toBe(200);
    expect((await shop.get(`/products/${lamp.id}`)).status).toBe(404);
    const tracked = await track(sf, ordered.trackingId);
    expect(tracked.status, JSON.stringify(tracked.body)).toBe(200);
    expect(tracked.body).toMatchObject({
      orderNumber: ordered.orderNumber,
      items: [
        {
          productName: 'Lamp',
          attributes: [{ name: 'Color', value: 'Red', variantDefining: true }],
          quantity: '2.000',
          unitPrice: '300.00',
          itemTotal: '600.00',
        },
      ],
      subtotal: '600.00',
      deliveryCharge: '70.00',
      grandTotal: '670.00',
    });
  });

  it('holds one visitor to 60 tracking reads a minute', async () => {
    const shop = await openShop(port, texts, 'po');
    const own = await ownKey(shop);
    for (let index = 0; index < 60; index += 1) {
      expect((await track(own, 'ZZZZ2222', '198.51.100.21')).status).toBe(404);
    }
    expect((await track(own, 'ZZZZ2222', '198.51.100.21')).status).toBe(429);
  });
});

describeIfDatabase("Meta's server-side Purchase (LND-16, PRF-05)", () => {
  function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async function queued(tenantId: string): Promise<{ tenantId: string; orderId: string }[]> {
    const { rows } = await admin.query<{ payload: { tenantId: string; orderId: string } }>(
      `SELECT payload FROM control.job_outbox WHERE queue_name = 'meta_purchase' AND payload->>'tenantId' = $1`,
      [tenantId],
    );
    return rows.map((row) => row.payload);
  }

  it('queues nothing for a shop without a Conversions API token', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const own = await ownKey(shop);
    expect((await shop.put('/ad-tracking', { metaPixelId: '1234567890' })).status).toBe(200);
    await placed(own, {
      ...(await shopper(shop)),
      items: [{ variantId: lamp.variantId, quantity: 1 }],
    });
    expect(await queued(shop.tenantId)).toEqual([]);
  });

  it("queues the purchase with the order and sends it with the browser's event ID, the hashed phone and district", async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const own = await ownKey(shop);
    expect(
      (
        await shop.put('/ad-tracking', {
          metaPixelId: '1234567890',
          conversionsApiToken: 'EAAB-test-token-value',
        })
      ).status,
    ).toBe(200);
    const who = await shopper(shop);
    const made = await placed(own, { ...who, items: [{ variantId: lamp.variantId, quantity: 2 }] });
    const jobs = await queued(shop.tenantId);
    expect(jobs).toEqual([{ tenantId: shop.tenantId, orderId: await orderIdOf(made.trackingId) }]);
    await app.get(MetaPurchaseSender).send(jobs[0] ?? { tenantId: '', orderId: '' });
    expect(meta.sent).toHaveLength(1);
    const [sent] = meta.sent;
    expect(sent?.pixelId).toBe('1234567890');
    expect(sent?.token).toBe('EAAB-test-token-value');
    expect(sent?.events).toHaveLength(1);
    expect(sent?.events[0]).toMatchObject({
      event_name: 'Purchase',
      event_id: made.purchaseEventId,
      action_source: 'website',
      user_data: { ph: [sha256(`88${who.phone}`)], ct: [sha256('dhaka')] },
      custom_data: {
        currency: 'BDT',
        value: 670,
        content_ids: [lamp.variantId],
        contents: [{ id: lamp.variantId, quantity: 2 }],
        order_id: made.orderNumber,
      },
    });
  });

  it('leaves the order alone while Meta is away, and stops calling it after five failures in a row', async () => {
    const shop = await openShop(port, texts, 'po');
    const lamp = await product(shop, 'Lamp', 300, 10);
    const own = await ownKey(shop);
    await shop.put('/ad-tracking', {
      metaPixelId: '1234567890',
      conversionsApiToken: 'EAAB-token',
    });
    meta.away = true;
    const made = await placed(own, {
      ...(await shopper(shop)),
      items: [{ variantId: lamp.variantId, quantity: 1 }],
    });
    expect(made.status).toBe('pending');
    const [job] = await queued(shop.tenantId);
    if (!job) throw new Error('the purchase is queued');
    const sender = app.get(MetaPurchaseSender);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(sender.send(job)).rejects.toThrow('Meta is away');
    }
    await expect(sender.send(job)).rejects.toThrow('open');
    expect(meta.calls).toBe(5);
  });
});
