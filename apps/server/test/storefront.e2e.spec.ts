import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 12a, agreed 2026-10-29: what the storefront's own server reads -- the shop a host serves and the key it
// calls the public API with (behind the storefront's secret), the storefront switch (SFT-16), the shop's logo, contact
// details and zones (TEN-16, TEN-30, DLV-01), a product's zones (DLV-07), the thana list (CUS-08) and the delivery
// estimate (SFT-20), priced by the one function orders are. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_storefront_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SECRET = 'storefront-e2e-secret-0123456789abcdefghijklmnop';
const API_HOST = 'api.localhost';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'storefront-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = SECRET;
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
  delete process.env['STOREFRONT_SECRET'];
  await app.close();
  await admin.end();
});

interface Context {
  outcome: 'open' | 'closed' | 'not_found';
  shop: { slug: string; storefrontEnabled: boolean; key: string; origin: string } | null;
}

function context(host: string, secret: string | null = SECRET): Promise<HttpResult> {
  return sendExact(
    port,
    'GET',
    `/api/v1/internal/storefront/context?host=${encodeURIComponent(host)}`,
    undefined,
    { host: 'localhost', ...(secret === null ? {} : { 'x-lytro-storefront': secret }) },
  );
}

async function open(shop: ShopClient): Promise<NonNullable<Context['shop']>> {
  const result = await context(`${shop.slug}.localhost`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const body = result.body as Context;
  expect(body.outcome).toBe('open');
  if (!body.shop) throw new Error('an open shop is named');
  return body.shop;
}

function asStorefront(
  method: 'GET' | 'POST',
  path: string,
  shop: NonNullable<Context['shop']>,
  payload?: unknown,
): Promise<HttpResult> {
  return sendExact(port, method, path, payload, {
    host: API_HOST,
    authorization: `Bearer ${shop.key}`,
    origin: shop.origin,
    ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
  });
}

async function product(shop: ShopClient, body: Record<string, unknown>) {
  const made = await shop.post('/products', {
    basePrice: 500,
    variants: [{ optionIds: [], openingStock: 5 }],
    ...body,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const created = made.body as { id: string; slug: string; variants: { id: string }[] };
  return { ...created, variantId: created.variants[0]?.id ?? '' };
}

async function thana(shop: ShopClient, zilla: string, name: string): Promise<number> {
  const list = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const found = list.zillas
    .find((row) => row.nameEn === zilla)
    ?.thanas.find((row) => row.nameEn === name);
  if (!found) throw new Error(`no thana ${zilla}/${name}`);
  return found.id;
}

describeIfDatabase("the storefront's context (Slice 12, TEN-08, SFT-12, SFT-16)", () => {
  it("answers only the storefront's own server, by its secret", async () => {
    const shop = await openShop(port, texts, 'sf');
    expect((await context(`${shop.slug}.localhost`, null)).status).toBe(404);
    expect((await context(`${shop.slug}.localhost`, `${SECRET}x`)).status).toBe(404);
    expect((await context(`${shop.slug}.localhost`)).status).toBe(200);
  });

  it('names an open shop with one storefront key, and none for an unknown or a closed one', async () => {
    const shop = await openShop(port, texts, 'sf');
    const [one, two] = await Promise.all([open(shop), open(shop)]);
    expect(one.key).toMatch(/^lytro_pk_[A-Za-z0-9]{32}$/);
    expect(two.key).toBe(one.key);
    expect(one).toMatchObject({
      slug: shop.slug,
      storefrontEnabled: true,
      origin: `http://${shop.slug}.localhost`,
    });
    expect((await context('nobody-here.localhost')).body).toEqual({
      outcome: 'not_found',
      shop: null,
    });
    expect((await context('app.localhost')).body).toMatchObject({ outcome: 'not_found' });
    const slug = `sf-closed-${String(Date.now())}`;
    await seedShop(admin, 'Closed shop', slug, 'read_only');
    expect((await context(`${slug}.localhost`)).body).toEqual({ outcome: 'closed', shop: null });
  });

  it("shows the key in the shop's list as Lytro's, never changed or revoked, and outside the 20", async () => {
    const shop = await openShop(port, texts, 'sf');
    const opened = await open(shop);
    const keys = (await shop.get('/api-keys')).body as {
      id: string;
      name: string;
      prefix: string;
      purpose: string | null;
      websites: string[];
    }[];
    const managed = keys.find((row) => row.purpose === 'storefront');
    expect(managed).toMatchObject({
      name: 'Lytro storefront',
      prefix: opened.key.slice(0, 13),
      websites: [opened.origin],
    });
    const id = managed?.id ?? '';
    const renamed = await shop.patch(`/api-keys/${id}`, { name: 'Mine now' });
    expect(renamed.status).toBe(409);
    expect(errorOf(renamed).code).toBe('conflict');
    expect((await shop.post(`/api-keys/${id}/revoke`, {})).status).toBe(409);
    for (let n = 0; n < 20; n += 1) {
      const made = await shop.post('/api-keys', {
        name: `Site ${String(n)}`,
        websites: ['https://a.com'],
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
    }
    expect(
      (await shop.post('/api-keys', { name: 'One too many', websites: ['https://a.com'] })).status,
    ).toBe(402);
  });

  it('follows the storefront switch, and logs it with the shop settings', async () => {
    const shop = await openShop(port, texts, 'sf');
    expect((await open(shop)).storefrontEnabled).toBe(true);
    const off = await shop.patch('/shop-settings', { storefrontEnabled: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect((off.body as { storefrontEnabled: boolean }).storefrontEnabled).toBe(false);
    expect((await open(shop)).storefrontEnabled).toBe(false);
    const logged = await admin.query<{ summary: { storefrontEnabled?: boolean } }>(
      "SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'shop_settings_updated'",
      [shop.tenantId],
    );
    expect(logged.rows.map((row) => row.summary.storefrontEnabled)).toContain(false);
    await shop.patch('/shop-settings', { storefrontEnabled: true });
    expect((await open(shop)).storefrontEnabled).toBe(true);
  });
});

describeIfDatabase('what the storefront reads (TEN-16, TEN-30, DLV-01, DLV-07, CUS-08)', () => {
  it("gives the shop's contact details and zones, and a product's zones", async () => {
    const shop = await openShop(port, texts, 'sf');
    await shop.patch('/shop-settings', { contactPhone: '01711000000', contactEmail: null });
    const sf = await open(shop);
    const read = await asStorefront('GET', '/v1/shop', sf);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const view = read.body as {
      logo: unknown;
      contact: Record<string, unknown>;
      deliveryZones: { id: string; charge: string; noDelivery: boolean; name: { en: string } }[];
    };
    expect(view.logo).toBeNull();
    expect(view.contact).toEqual({ phone: '01711000000', email: null, address: null });
    expect(view.deliveryZones.map((zone) => [zone.name.en, zone.charge, zone.noDelivery])).toEqual([
      ['Inside Dhaka city', '70.00', false],
      ['Outside Dhaka city', '130.00', false],
    ]);
    const home = view.deliveryZones[0]?.id ?? '';
    const fish = await product(shop, { name: 'Frozen fish' });
    await shop.put(`/products/${fish.id}/delivery-zones`, { zoneIds: [home] });
    const detail = await asStorefront('GET', `/v1/catalogue/products/${fish.slug}`, sf);
    expect((detail.body as { deliveryZoneIds: string[] }).deliveryZoneIds).toEqual([home]);
    const locations = await asStorefront('GET', '/v1/locations', sf);
    expect(locations.status).toBe(200);
    expect((locations.body as { zillas: unknown[] }).zillas.length).toBeGreaterThan(60);
  });

  it('estimates delivery as a range before a thana, and exactly after, by the order rule (SFT-20)', async () => {
    const shop = await openShop(port, texts, 'sf');
    const sf = await open(shop);
    const shirt = await product(shop, { name: 'Shirt' });
    const lamp = await product(shop, {
      name: 'Lamp',
      deliveryCharge: 120,
      deliveryMode: 'default',
    });
    const items = [
      { variantId: shirt.variantId, quantity: 2 },
      { variantId: lamp.variantId, quantity: 3 },
    ];
    const range = await asStorefront('POST', '/v1/delivery-estimate', sf, { items });
    expect(range.status, JSON.stringify(range.body)).toBe(200);
    expect(range.body).toMatchObject({
      zone: null,
      deliveryCharge: null,
      range: { from: '430.00', to: '490.00' },
      deliverable: true,
    });
    const mirpur = await thana(shop, 'Dhaka', 'Mirpur');
    const exact = await asStorefront('POST', '/v1/delivery-estimate', sf, {
      items,
      locationId: mirpur,
    });
    expect(exact.body).toMatchObject({
      zone: { charge: '70.00', noDelivery: false },
      deliveryCharge: '430.00',
      range: null,
      deliverable: true,
      notDeliveredHere: [],
    });
  });

  it('says where items cannot go -- a no-delivery zone, a product limited elsewhere (DLV-06, DLV-07)', async () => {
    const shop = await openShop(port, texts, 'sf');
    const sf = await open(shop);
    const zones = (
      (await asStorefront('GET', '/v1/shop', sf)).body as {
        deliveryZones: { id: string }[];
      }
    ).deliveryZones;
    const [home, outside] = [zones[0]?.id ?? '', zones[1]?.id ?? ''];
    const fish = await product(shop, { name: 'Frozen fish' });
    await shop.put(`/products/${fish.id}/delivery-zones`, { zoneIds: [home] });
    const rajpara = await thana(shop, 'Rajshahi', 'Rajpara');
    const limited = await asStorefront('POST', '/v1/delivery-estimate', sf, {
      items: [{ variantId: fish.variantId, quantity: 1 }],
      locationId: rajpara,
    });
    expect(limited.body).toMatchObject({ deliverable: false, notDeliveredHere: ['Frozen fish'] });
    const before = await asStorefront('POST', '/v1/delivery-estimate', sf, {
      items: [{ variantId: fish.variantId, quantity: 1 }],
    });
    expect(before.body).toMatchObject({ range: { from: '70.00', to: '70.00' }, deliverable: true });
    await shop.patch(`/delivery-zones/${outside}`, { noDelivery: true });
    const shirt = await product(shop, { name: 'Shirt' });
    const noDelivery = await asStorefront('POST', '/v1/delivery-estimate', sf, {
      items: [{ variantId: shirt.variantId, quantity: 1 }],
      locationId: rajpara,
    });
    expect(noDelivery.body).toMatchObject({ zone: { noDelivery: true }, deliverable: false });
  });

  it("refuses an item not on sale, or another shop's, naming it (PRD-06)", async () => {
    const shop = await openShop(port, texts, 'sf');
    const other = await openShop(port, texts, 'sf');
    const sf = await open(shop);
    const theirs = await product(other, { name: 'Theirs' });
    const hidden = await product(shop, { name: 'Hidden' });
    await shop.patch(`/products/${hidden.id}`, { active: false });
    const refused = await asStorefront('POST', '/v1/delivery-estimate', sf, {
      items: [
        { variantId: theirs.variantId, quantity: 1 },
        { variantId: hidden.variantId, quantity: 1 },
      ],
    });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toMatchObject({
      'items.0.variantId': 'not_found',
      'items.1.variantId': 'not_found',
    });
  });
});
