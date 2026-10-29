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
import { errorOf, openShop, type ShopClient } from './support/shop-client';
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

  it('replaces a key whose sealed value can no longer be opened, as after a lost data key', async () => {
    const shop = await openShop(port, texts, 'sf');
    const dead = await admin.query<{ id: string }>(
      `INSERT INTO control.api_keys (tenant_id, type, purpose, name, prefix, key_hash, websites, sealed_value)
       VALUES ($1, 'public', 'storefront', 'Lytro storefront', 'lytro_pk_dead', $2, $3, $4)
       RETURNING id`,
      [
        shop.tenantId,
        'f'.repeat(64),
        [`http://${shop.slug}.localhost`],
        // Bytes no data key opens.
        Buffer.from([0, 1, 2, 3]),
      ],
    );
    const opened = await open(shop);
    expect(opened.key).toMatch(/^lytro_pk_[A-Za-z0-9]{32}$/);
    const rows = await admin.query<{ id: string; revoked: boolean }>(
      "SELECT id, revoked_at IS NOT NULL AS revoked FROM control.api_keys WHERE tenant_id = $1 AND purpose = 'storefront'",
      [shop.tenantId],
    );
    expect(rows.rows.find((row) => row.id === dead.rows[0]?.id)?.revoked).toBe(true);
    expect(rows.rows.filter((row) => !row.revoked)).toHaveLength(1);
    expect((await asStorefront('GET', '/v1/shop', opened)).status).toBe(200);
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
      lines: [
        { variantId: shirt.variantId, onSale: true, price: '500.00', itemTotal: '1000.00' },
        { variantId: lamp.variantId, onSale: true, price: '500.00', itemTotal: '1500.00' },
      ],
      subtotal: '2500.00',
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

  it('answers each line as it stands; prices only what can be ordered (PRD-06, ATR-07, Slice 12b)', async () => {
    const shop = await openShop(port, texts, 'sf');
    const other = await openShop(port, texts, 'sf');
    const sf = await open(shop);
    const theirs = await product(other, { name: 'Theirs' });
    const hidden = await product(shop, { name: 'Hidden' });
    await shop.patch(`/products/${hidden.id}`, { active: false });
    const gone = await product(shop, { name: 'Gone' });
    await shop.delete(`/products/${gone.id}`);
    const empty = await product(shop, {
      name: 'Empty',
      variants: [{ optionIds: [], openingStock: 0 }],
    });
    const shirt = await product(shop, { name: 'Shirt', basePrice: 450 });
    const item = (made: { variantId: string }, quantity = 1) => ({
      variantId: made.variantId,
      quantity,
    });
    const notSold = (made: { variantId: string }) => ({
      variantId: made.variantId,
      onSale: false,
      price: null,
      stockState: null,
      available: false,
      itemTotal: null,
      advance: null,
    });
    const asked = { items: [item(theirs), item(hidden), item(gone), item(empty), item(shirt, 2)] };

    const answer = await asStorefront('POST', '/v1/delivery-estimate', sf, asked);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body).toMatchObject({
      lines: [
        notSold(theirs),
        notSold(hidden),
        notSold(gone),
        {
          variantId: empty.variantId,
          onSale: true,
          price: '500.00',
          stockState: 'out',
          available: false,
          itemTotal: null,
          advance: null,
        },
        {
          variantId: shirt.variantId,
          onSale: true,
          price: '450.00',
          // Five in stock at the default threshold of five: few left.
          stockState: 'low',
          available: true,
          itemTotal: '900.00',
          advance: '0.00',
        },
      ],
      subtotal: '900.00',
      range: { from: '70.00', to: '130.00' },
      deliverable: true,
    });

    expect((await shop.patch(`/products/${shirt.id}`, { basePrice: 475 })).status).toBe(200);
    const repriced = await asStorefront('POST', '/v1/delivery-estimate', sf, asked);
    expect(repriced.body).toMatchObject({ subtotal: '950.00' });
    expect((repriced.body as { lines: { price: string | null }[] }).lines[4]?.price).toBe('475.00');

    const nothing = await asStorefront('POST', '/v1/delivery-estimate', sf, {
      items: [item(hidden), item(empty)],
      locationId: await thana(shop, 'Dhaka', 'Mirpur'),
    });
    expect(nothing.body).toMatchObject({
      subtotal: '0.00',
      zone: null,
      deliveryCharge: null,
      range: null,
      deliverable: false,
    });
  });
});
