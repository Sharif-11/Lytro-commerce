import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 1c: the canonical location list (CUS-08), delivery zones around the home area (DLV-01 to DLV-04,
// DLV-06), product zone limits (DLV-07) and the shop's default payment policy (PRD-08), over HTTP and at the data
// layer. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_delivery_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appClient: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'delivery-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  appClient = new pg.Client({ connectionString: appDbUrl });
  await appClient.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await appClient.end();
  await admin.end();
});

interface Thana {
  id: number;
  nameEn: string;
  nameBn: string;
  cityCode: string | null;
}

interface Locations {
  cities: { code: string; nameEn: string; nameBn: string }[];
  zillas: { id: number; nameEn: string; nameBn: string; thanas: Thana[] }[];
}

interface Zone {
  id: string;
  name: string | null;
  label: { en: string; bn: string };
  charge: string;
  isHome: boolean;
  isFallback: boolean;
  noDelivery: boolean;
  areas: {
    zillas: { id: number }[];
    cities: { code: string }[];
    thanas: { id: number }[];
  };
}

interface Settings {
  homeArea: { kind: string; label: { en: string; bn: string } };
  zones: Zone[];
  maxZones: number;
}

let list: Locations | null = null;

async function locations(shop: ShopClient): Promise<Locations> {
  if (!list) {
    const result = await shop.get('/locations');
    expect(result.status).toBe(200);
    list = result.body as Locations;
  }
  return list;
}

async function zillaId(shop: ShopClient, zilla: string): Promise<number> {
  const found = (await locations(shop)).zillas.find((row) => row.nameEn === zilla);
  if (!found) throw new Error(`no zilla ${zilla}`);
  return found.id;
}

async function thanaId(shop: ShopClient, zilla: string, thana: string): Promise<number> {
  const found = (await locations(shop)).zillas
    .find((row) => row.nameEn === zilla)
    ?.thanas.find((row) => row.nameEn === thana);
  if (!found) throw new Error(`no thana ${zilla}/${thana}`);
  return found.id;
}

async function settings(shop: ShopClient): Promise<Settings> {
  const result = await shop.get('/delivery-zones');
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Settings;
}

function home(view: Settings): Zone {
  const zone = view.zones.find((row) => row.isHome);
  if (!zone) throw new Error('no home zone');
  return zone;
}

function fallback(view: Settings): Zone {
  const zone = view.zones.find((row) => row.isFallback);
  if (!zone) throw new Error('no fallback zone');
  return zone;
}

async function addZone(
  shop: ShopClient,
  name: string,
  charge: number,
  areas: { zillaIds?: number[]; cityCodes?: string[]; locationIds?: number[] },
): Promise<Zone> {
  const result = await shop.post('/delivery-zones', { name, charge, areas });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const zone = (result.body as Settings).zones.find((row) => row.name === name);
  if (!zone) throw new Error(`zone ${name} not returned`);
  return zone;
}

async function resolve(shop: ShopClient, locationId: number) {
  const result = await shop.get(`/delivery-zones/resolve?locationId=${String(locationId)}`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as { matchedBy: string; zone: Zone };
}

async function version(tenantId: string): Promise<number> {
  const result = await admin.query<{ version: string }>(
    'SELECT version FROM tenant.catalogue_state WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(result.rows[0]?.version ?? 0);
}

describeIfDatabase('the canonical location list (CUS-08)', () => {
  it('lists every zilla with its thanas and the 11 city areas, the same for every shop', async () => {
    const shop = await openShop(port, texts, 'locations');
    const other = await openShop(port, texts, 'locations-other');
    const mine = (await shop.get('/locations')).body as Locations;
    expect((await other.get('/locations')).body).toEqual(mine);

    expect(mine.cities.map((city) => city.code)).toEqual([
      'dhaka',
      'chattogram',
      'khulna',
      'rajshahi',
      'sylhet',
      'barishal',
      'rangpur',
      'mymensingh',
      'gazipur',
      'narayanganj',
      'cumilla',
    ]);
    expect(mine.zillas).toHaveLength(64);
    expect(mine.zillas.flatMap((zilla) => zilla.thanas)).toHaveLength(572);

    const dhaka = mine.zillas.find((zilla) => zilla.nameEn === 'Dhaka');
    expect(dhaka?.nameBn).toBe('ঢাকা');
    expect(dhaka?.thanas.filter((thana) => thana.cityCode === 'dhaka')).toHaveLength(49);
    expect(dhaka?.thanas.find((thana) => thana.nameEn === 'Mirpur')).toMatchObject({
      nameBn: 'মিরপুর',
      cityCode: 'dhaka',
    });
    expect(dhaka?.thanas.find((thana) => thana.nameEn === 'Savar')?.cityCode).toBeNull();
    // Karnaphuli is an upazila, not part of Chattogram city.
    const chattogram = mine.zillas.find((zilla) => zilla.nameEn === 'Chattogram');
    expect(chattogram?.thanas.find((thana) => thana.nameEn === 'Karnaphuli')?.cityCode).toBeNull();
    expect(chattogram?.thanas.filter((thana) => thana.cityCode === 'chattogram')).toHaveLength(15);
  });
});

describeIfDatabase('the two default zones and the home area (DLV-01)', () => {
  it('starts every shop with "Inside Dhaka city" at 70 TK and "Outside Dhaka city" at 130 TK', async () => {
    const shop = await openShop(port, texts, 'defaults');
    const view = await settings(shop);
    expect(view.homeArea).toEqual({
      kind: 'city',
      label: { en: 'Dhaka city', bn: 'ঢাকা সিটি' },
    });
    expect(view.zones).toHaveLength(2);
    expect(home(view)).toMatchObject({
      name: null,
      label: { en: 'Inside Dhaka city', bn: 'ঢাকা সিটির ভিতরে' },
      charge: '70.00',
      areas: { cities: [{ code: 'dhaka' }], zillas: [], thanas: [] },
    });
    expect(fallback(view)).toMatchObject({
      name: null,
      label: { en: 'Outside Dhaka city', bn: 'ঢাকা সিটির বাইরে' },
      charge: '130.00',
    });
    // Asking again makes nothing new.
    expect((await settings(shop)).zones.map((zone) => zone.id)).toEqual(
      view.zones.map((zone) => zone.id),
    );
  });

  it('renames and refills the two zones from a new home area, keeping both charges and any name of its own', async () => {
    const shop = await openShop(port, texts, 'home-area');
    const before = await settings(shop);
    const moved = await shop.put('/delivery-zones/home-area', {
      areas: { cityCodes: ['chattogram'] },
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const view = moved.body as Settings;
    expect(home(view)).toMatchObject({
      id: home(before).id,
      label: { en: 'Inside Chattogram city', bn: 'চট্টগ্রাম সিটির ভিতরে' },
      charge: '70.00',
      areas: { cities: [{ code: 'chattogram' }] },
    });
    expect(fallback(view).label.en).toBe('Outside Chattogram city');
    expect(fallback(view).charge).toBe('130.00');

    // A home zone the tenant renamed keeps its name; the fallback still follows the area.
    await shop.patch(`/delivery-zones/${home(view).id}`, { name: 'Ctg city' });
    const zilla = await zillaId(shop, 'Chattogram');
    const district = (await shop.put('/delivery-zones/home-area', { areas: { zillaIds: [zilla] } }))
      .body as Settings;
    expect(home(district).label).toEqual({ en: 'Ctg city', bn: 'Ctg city' });
    expect(fallback(district).label).toEqual({
      en: 'Outside Chattogram district',
      bn: 'চট্টগ্রাম জেলার বাইরে',
    });
    expect(district.homeArea.kind).toBe('zilla');

    // The tenant's own thanas, and a null name back to the automatic one.
    const thanas = [
      await thanaId(shop, 'Dhaka', 'Mirpur'),
      await thanaId(shop, 'Dhaka', 'Pallabi'),
      await thanaId(shop, 'Dhaka', 'Kafrul'),
    ];
    await shop.put('/delivery-zones/home-area', { areas: { locationIds: thanas } });
    const own = (await shop.patch(`/delivery-zones/${home(view).id}`, { name: null }))
      .body as Settings;
    expect(home(own).label).toEqual({
      en: 'Inside Mirpur, Pallabi and 1 more',
      bn: 'মিরপুর, পল্লবী ও আরও 1টি এলাকার ভিতরে',
    });
    expect(own.homeArea.kind).toBe('thanas');
  });

  it('refuses a home area that is not one city, one district or thanas, and an area that does not exist', async () => {
    const shop = await openShop(port, texts, 'home-bad');
    const two = await shop.put('/delivery-zones/home-area', {
      areas: { cityCodes: ['dhaka', 'chattogram'] },
    });
    expect(errorOf(two).code).toBe('validation_error');
    expect(fieldsOf(two)).toEqual({ areas: 'not_allowed' });
    const unknown = await shop.put('/delivery-zones/home-area', {
      areas: { cityCodes: ['atlantis'] },
    });
    expect(fieldsOf(unknown)).toEqual({ 'areas.cityCodes.0': 'not_found' });
    const missingThana = await shop.put('/delivery-zones/home-area', {
      areas: { locationIds: [999_999] },
    });
    expect(fieldsOf(missingThana)).toEqual({ 'areas.locationIds.0': 'not_found' });
  });
});

describeIfDatabase('every thana resolves to exactly one zone (DLV-02)', () => {
  it('takes the zone naming the thana, else its city, else its district, else the fallback', async () => {
    const shop = await openShop(port, texts, 'resolve');
    await shop.put('/delivery-zones/home-area', { areas: { cityCodes: ['chattogram'] } });
    const rest = await addZone(shop, 'Rest of Chattogram district', 100, {
      zillaIds: [await zillaId(shop, 'Chattogram')],
    });
    const dhaka = await addZone(shop, 'Dhaka', 120, { cityCodes: ['dhaka'] });
    const view = await settings(shop);

    const panchlaish = await thanaId(shop, 'Chattogram', 'Panchlaish');
    expect(await resolve(shop, panchlaish)).toMatchObject({
      matchedBy: 'city',
      zone: { id: home(view).id, charge: '70.00' },
    });
    expect(await resolve(shop, await thanaId(shop, 'Chattogram', 'Sitakunda'))).toMatchObject({
      matchedBy: 'zilla',
      zone: { id: rest.id },
    });
    expect(await resolve(shop, await thanaId(shop, 'Dhaka', 'Mirpur'))).toMatchObject({
      matchedBy: 'city',
      zone: { id: dhaka.id, charge: '120.00' },
    });
    expect(await resolve(shop, await thanaId(shop, 'Sylhet', 'Sylhet Sadar'))).toMatchObject({
      matchedBy: 'fallback',
      zone: { id: fallback(view).id },
    });

    // A thana-level zone takes only that thana.
    const patenga = await thanaId(shop, 'Chattogram', 'Patenga');
    const port_ = await addZone(shop, 'Port area', 60, { locationIds: [patenga] });
    expect(await resolve(shop, patenga)).toMatchObject({
      matchedBy: 'thana',
      zone: { id: port_.id },
    });
    expect((await resolve(shop, panchlaish)).zone.id).toBe(home(view).id);
  });

  it('refuses an area another zone already has, naming it', async () => {
    const shop = await openShop(port, texts, 'resolve-taken');
    await shop.put('/delivery-zones/home-area', { areas: { cityCodes: ['chattogram'] } });
    const again = await shop.post('/delivery-zones', {
      name: 'Second',
      charge: 50,
      areas: { cityCodes: ['chattogram'] },
    });
    expect(again.status).toBe(409);
    expect(fieldsOf(again)).toEqual({ 'areas.cityCodes.0': 'taken' });
    // A different level is not the same area: the district may sit in its own zone.
    await addZone(shop, 'District', 90, { zillaIds: [await zillaId(shop, 'Chattogram')] });
    const homeBack = await shop.put('/delivery-zones/home-area', {
      areas: { zillaIds: [await zillaId(shop, 'Chattogram')] },
    });
    expect(homeBack.status).toBe(409);
    expect(errorOf(homeBack).details).toMatchObject({ zoneIds: [expect.any(String)] });
  });

  it("resolves against the session shop's own zones only", async () => {
    const shop = await openShop(port, texts, 'resolve-own');
    const other = await openShop(port, texts, 'resolve-other');
    await addZone(other, 'Gazipur', 100, { zillaIds: [await zillaId(other, 'Gazipur')] });
    const kaliakair = await thanaId(shop, 'Gazipur', 'Kaliakair');
    expect((await resolve(shop, kaliakair)).matchedBy).toBe('fallback');
    expect((await resolve(other, kaliakair)).matchedBy).toBe('zilla');
    expect((await shop.get('/delivery-zones/resolve?locationId=999999')).status).toBe(404);
  });
});

describeIfDatabase('managing zones (DLV-01, DLV-04, DLV-06)', () => {
  it('adds, re-prices, marks "no delivery" and deletes a zone, each in the activity log', async () => {
    const shop = await openShop(port, texts, 'manage');
    const versionBefore = await version(shop.tenantId);
    const gazipur = await addZone(shop, 'Gazipur', 100, {
      zillaIds: [await zillaId(shop, 'Gazipur')],
    });
    expect(gazipur).toMatchObject({ label: { en: 'Gazipur', bn: 'Gazipur' }, charge: '100.00' });
    expect(await version(shop.tenantId)).toBeGreaterThan(versionBefore);

    const repriced = (await shop.patch(`/delivery-zones/${gazipur.id}`, { charge: 110 }))
      .body as Settings;
    expect(repriced.zones.find((zone) => zone.id === gazipur.id)?.charge).toBe('110.00');

    const view = await settings(shop);
    const closed = (await shop.patch(`/delivery-zones/${fallback(view).id}`, { noDelivery: true }))
      .body as Settings;
    expect(fallback(closed).noDelivery).toBe(true);

    expect((await shop.patch(`/delivery-zones/${gazipur.id}`, { name: null })).status).toBe(400);
    const savar = await thanaId(shop, 'Dhaka', 'Savar');
    const refilled = (
      await shop.put(`/delivery-zones/${gazipur.id}/areas`, { areas: { locationIds: [savar] } })
    ).body as Settings;
    expect(refilled.zones.find((zone) => zone.id === gazipur.id)?.areas).toMatchObject({
      zillas: [],
      thanas: [{ id: savar }],
    });

    expect((await shop.delete(`/delivery-zones/${gazipur.id}`)).status).toBe(200);
    expect((await settings(shop)).zones).toHaveLength(2);

    const logged = await admin.query<{ action: string; summary: Record<string, unknown> }>(
      `SELECT action, summary FROM tenant.activity_log
       WHERE tenant_id = $1 AND action LIKE 'delivery_%' ORDER BY created_at, action`,
      [shop.tenantId],
    );
    expect(logged.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'delivery_zone_created',
        'delivery_zone_updated',
        'delivery_zone_deleted',
      ]),
    );
    expect(
      logged.rows.find((row) => row.action === 'delivery_zone_updated' && 'charge' in row.summary)
        ?.summary,
    ).toMatchObject({ charge: { from: '100.00', to: '110.00' } });
  });

  it('keeps the inside and outside zones, and holds at most 20 zones', async () => {
    const shop = await openShop(port, texts, 'limits');
    const view = await settings(shop);
    expect((await shop.delete(`/delivery-zones/${home(view).id}`)).status).toBe(409);
    expect((await shop.delete(`/delivery-zones/${fallback(view).id}`)).status).toBe(409);
    expect(
      (
        await shop.put(`/delivery-zones/${fallback(view).id}/areas`, {
          areas: { cityCodes: ['sylhet'] },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await shop.put(`/delivery-zones/${home(view).id}/areas`, {
          areas: { cityCodes: ['sylhet'] },
        })
      ).status,
    ).toBe(409);

    const dhaka = (await locations(shop)).zillas.find((zilla) => zilla.nameEn === 'Dhaka');
    const thanas = dhaka?.thanas.filter((thana) => thana.cityCode === null) ?? [];
    const rajshahi = (await locations(shop)).zillas.find((zilla) => zilla.nameEn === 'Rajshahi');
    const pool = [...thanas, ...(rajshahi?.thanas ?? [])].map((thana) => thana.id);
    for (let n = 0; n < 18; n += 1) {
      await addZone(shop, `Zone ${String(n)}`, 50, { locationIds: [pool[n] ?? 0] });
    }
    const refused = await shop.post('/delivery-zones', {
      name: 'One too many',
      charge: 50,
      areas: { locationIds: [pool[18] ?? 0] },
    });
    expect(refused.status).toBe(409);
    expect(errorOf(refused)).toMatchObject({ code: 'conflict', details: { max: 20 } });
  });

  it("answers 404 for another shop's zone", async () => {
    const shop = await openShop(port, texts, 'manage-own');
    const other = await openShop(port, texts, 'manage-other');
    const theirs = await addZone(other, 'Theirs', 80, { cityCodes: ['sylhet'] });
    expect((await shop.patch(`/delivery-zones/${theirs.id}`, { charge: 1 })).status).toBe(404);
    expect(
      (await shop.put(`/delivery-zones/${theirs.id}/areas`, { areas: { cityCodes: ['rangpur'] } }))
        .status,
    ).toBe(404);
    expect((await shop.delete(`/delivery-zones/${theirs.id}`)).status).toBe(404);
    expect((await settings(other)).zones.find((zone) => zone.id === theirs.id)?.charge).toBe(
      '80.00',
    );
  });
});

describeIfDatabase("a product's delivery limit (DLV-07)", () => {
  it('limits a product to chosen zones, copies the limit with the product, and keeps a named zone', async () => {
    const shop = await openShop(port, texts, 'limit');
    const suburbs = await addZone(shop, 'Dhaka suburbs', 100, {
      locationIds: [await thanaId(shop, 'Dhaka', 'Savar')],
    });
    const homeZone = home(await settings(shop));
    const fish = (await shop.post('/products', { name: 'Frozen fish', basePrice: 600 })).body as {
      id: string;
      deliveryZoneIds: string[];
    };
    expect(fish.deliveryZoneIds).toEqual([]);

    const limited = await shop.put(`/products/${fish.id}/delivery-zones`, {
      zoneIds: [homeZone.id, suburbs.id, suburbs.id],
    });
    expect(limited.status, JSON.stringify(limited.body)).toBe(200);
    expect([...(limited.body as { deliveryZoneIds: string[] }).deliveryZoneIds].sort()).toEqual(
      [homeZone.id, suburbs.id].sort(),
    );

    const refused = await shop.delete(`/delivery-zones/${suburbs.id}`);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toEqual({ products: [{ id: fish.id, name: 'Frozen fish' }] });

    const copy = (await shop.post(`/products/${fish.id}/duplicate`, {})).body as {
      deliveryZoneIds: string[];
    };
    expect([...copy.deliveryZoneIds].sort()).toEqual([homeZone.id, suburbs.id].sort());

    const lifted = await shop.put(`/products/${fish.id}/delivery-zones`, { zoneIds: [] });
    expect((lifted.body as { deliveryZoneIds: string[] }).deliveryZoneIds).toEqual([]);
  });

  it('takes the limit with a new product, in its one request, and refuses a zone the shop lacks', async () => {
    const shop = await openShop(port, texts, 'limit-new');
    const homeZone = home(await settings(shop));
    const created = await shop.post('/products', {
      name: 'Frozen prawns',
      basePrice: 900,
      deliveryZoneIds: [homeZone.id, homeZone.id],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((created.body as { deliveryZoneIds: string[] }).deliveryZoneIds).toEqual([homeZone.id]);

    const other = await openShop(port, texts, 'limit-new-other');
    const theirs = await addZone(other, 'Theirs', 80, { cityCodes: ['khulna'] });
    const refused = await shop.post('/products', {
      name: 'Frozen squid',
      basePrice: 900,
      deliveryZoneIds: [theirs.id],
    });
    expect(fieldsOf(refused)).toEqual({ deliveryZoneIds: 'not_found' });
    // Refused, nothing was made.
    const listed = (await shop.get('/products?search=squid')).body as { products: unknown[] };
    expect(listed.products).toEqual([]);
  });

  it("refuses another shop's zone in a product's limit", async () => {
    const shop = await openShop(port, texts, 'limit-own');
    const other = await openShop(port, texts, 'limit-other');
    const theirs = await addZone(other, 'Theirs', 80, { cityCodes: ['khulna'] });
    const rice = (await shop.post('/products', { name: 'Rice', basePrice: 80 })).body as {
      id: string;
    };
    const refused = await shop.put(`/products/${rice.id}/delivery-zones`, { zoneIds: [theirs.id] });
    expect(fieldsOf(refused)).toEqual({ zoneIds: 'not_found' });
    expect(
      (await other.put(`/products/${rice.id}/delivery-zones`, { zoneIds: [theirs.id] })).status,
    ).toBe(404);
  });
});

describeIfDatabase("the shop's default payment policy (PRD-08)", () => {
  it('defaults to none, takes "delivery charge only", and needs an amount only for a partial advance', async () => {
    const shop = await openShop(port, texts, 'policy');
    expect((await shop.get('/shop-settings')).body).toMatchObject({
      defaultPaymentPolicy: 'none',
      defaultAdvanceAmount: null,
    });
    const deliveryOnly = await shop.patch('/shop-settings', {
      defaultPaymentPolicy: 'delivery_charge_only',
    });
    expect(deliveryOnly.body).toMatchObject({ defaultPaymentPolicy: 'delivery_charge_only' });

    const noAmount = await shop.patch('/shop-settings', {
      defaultPaymentPolicy: 'partial_advance',
    });
    expect(fieldsOf(noAmount)).toEqual({ defaultAdvanceAmount: 'required' });
    const partial = await shop.patch('/shop-settings', {
      defaultPaymentPolicy: 'partial_advance',
      defaultAdvanceAmount: 300,
    });
    expect(partial.body).toMatchObject({
      defaultPaymentPolicy: 'partial_advance',
      defaultAdvanceAmount: '300.00',
    });
    // Leaving a partial advance drops its amount; an amount on its own is refused.
    const none = await shop.patch('/shop-settings', { defaultPaymentPolicy: 'none' });
    expect(none.body).toMatchObject({ defaultPaymentPolicy: 'none', defaultAdvanceAmount: null });
    const stray = await shop.patch('/shop-settings', { defaultAdvanceAmount: 100 });
    expect(fieldsOf(stray)).toEqual({ defaultAdvanceAmount: 'not_allowed' });
  });

  it("gives the product form the shop's default, to someone who may only read products", async () => {
    const shop = await openShop(port, texts, 'policy-form');
    expect((await shop.get('/product-defaults')).body).toMatchObject({
      shopPaymentPolicy: { defaultPaymentPolicy: 'none', defaultAdvanceAmount: null },
    });
    await shop.patch('/shop-settings', {
      defaultPaymentPolicy: 'partial_advance',
      defaultAdvanceAmount: 200,
    });
    const reader = await staffWith(port, texts, admin, shop, ['products:read']);
    const seen = await getJson(port, '/product-defaults', reader);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      shopPaymentPolicy: {
        defaultPaymentPolicy: 'partial_advance',
        defaultAdvanceAmount: '200.00',
      },
    });
    expect((await getJson(port, '/shop-settings', reader)).status).toBe(403);
  });

  it("shows each product the policy that applies: its own, else the shop's default", async () => {
    const shop = await openShop(port, texts, 'policy-products');
    await shop.patch('/shop-settings', {
      defaultPaymentPolicy: 'partial_advance',
      defaultAdvanceAmount: 300,
    });
    interface Detail {
      id: string;
      paymentPolicy: string | null;
      advanceAmount: string | null;
      effectivePaymentPolicy: string;
      effectiveAdvanceAmount: string | null;
    }
    const follows = (await shop.post('/products', { name: 'Kurti', basePrice: 900 }))
      .body as Detail;
    expect(follows).toMatchObject({
      paymentPolicy: null,
      advanceAmount: null,
      effectivePaymentPolicy: 'partial_advance',
      effectiveAdvanceAmount: '300.00',
    });
    const own = (
      await shop.post('/products', {
        name: 'Saree',
        basePrice: 4000,
        paymentPolicy: 'partial_advance',
        advanceAmount: 500,
      })
    ).body as Detail;
    expect(own).toMatchObject({
      effectivePaymentPolicy: 'partial_advance',
      effectiveAdvanceAmount: '500.00',
    });
    const optedOut = (await shop.patch(`/products/${own.id}`, { paymentPolicy: 'none' }))
      .body as Detail;
    expect(optedOut).toMatchObject({
      effectivePaymentPolicy: 'none',
      effectiveAdvanceAmount: null,
    });

    // A change to the shop default reaches every product that follows it, and none that has its own.
    await shop.patch('/shop-settings', { defaultPaymentPolicy: 'delivery_charge_only' });
    expect((await shop.get(`/products/${follows.id}`)).body).toMatchObject({
      effectivePaymentPolicy: 'delivery_charge_only',
      effectiveAdvanceAmount: null,
    });
    expect((await shop.get(`/products/${own.id}`)).body).toMatchObject({
      effectivePaymentPolicy: 'none',
    });
    const back = (await shop.patch(`/products/${own.id}`, { paymentPolicy: null })).body as Detail;
    expect(back.effectivePaymentPolicy).toBe('delivery_charge_only');
  });
});

type Query = <R extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<pg.QueryResult<R>>;

/** Runs the work as the application role inside one shop's context, rolled back. */
async function asShop<T>(tenantId: string, work: (query: Query) => Promise<T>): Promise<T> {
  await appClient.query('BEGIN');
  try {
    await appClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return await work((sql, params) => appClient.query(sql, params));
  } finally {
    await appClient.query('ROLLBACK');
  }
}

describeIfDatabase('delivery zones at the data layer (DLV-01, DLV-02, DLV-07, DAT-03)', () => {
  it("keeps each shop's zones to itself and one of each area per shop", async () => {
    const shop = await openShop(port, texts, 'db-zones');
    const other = await openShop(port, texts, 'db-zones-other');
    await settings(shop);
    await settings(other);
    const seen = await asShop(shop.tenantId, (query) =>
      query<{ tenant_id: string }>('SELECT tenant_id FROM tenant.delivery_zones'),
    );
    expect(new Set(seen.rows.map((row) => row.tenant_id))).toEqual(new Set([shop.tenantId]));

    await expect(
      asShop(shop.tenantId, async (query) => {
        const zone = await query<{ id: string }>(
          "INSERT INTO tenant.delivery_zones (tenant_id, name, charge) VALUES ($1, 'Twice', 10) RETURNING id",
          [shop.tenantId],
        );
        // Dhaka city is already the home zone's.
        await query(
          "INSERT INTO tenant.delivery_zone_areas (tenant_id, zone_id, city_code) VALUES ($1, $2, 'dhaka')",
          [shop.tenantId, zone.rows[0]?.id],
        );
      }),
    ).rejects.toThrow(/delivery_zone_areas_city_idx/);

    await expect(
      asShop(shop.tenantId, (query) =>
        query(
          'INSERT INTO tenant.delivery_zones (tenant_id, is_home, charge) VALUES ($1, true, 10)',
          [shop.tenantId],
        ),
      ),
    ).rejects.toThrow(/delivery_zones_one_home_idx/);

    await expect(
      asShop(shop.tenantId, (query) =>
        query('INSERT INTO tenant.delivery_zones (tenant_id, charge) VALUES ($1, 10)', [
          shop.tenantId,
        ]),
      ),
    ).rejects.toThrow(/delivery_zones_name_check/);
  });

  it('refuses deleting a zone a product names, even written directly', async () => {
    const shop = await openShop(port, texts, 'db-limit');
    const zone = await addZone(shop, 'Named', 90, { cityCodes: ['rangpur'] });
    const product = (await shop.post('/products', { name: 'Ghee', basePrice: 500 })).body as {
      id: string;
    };
    await shop.put(`/products/${product.id}/delivery-zones`, { zoneIds: [zone.id] });
    await expect(
      asShop(shop.tenantId, (query) =>
        query('DELETE FROM tenant.delivery_zones WHERE id = $1', [zone.id]),
      ),
    ).rejects.toThrow(/product_delivery_zones_zone_fk/);
  });

  it('seeds the canonical list with fixed ids, readable by the application role', async () => {
    const counts = await appClient.query<{ cities: number; zillas: number; locations: number }>(
      `SELECT (SELECT count(*)::int FROM control.cities) AS cities,
              (SELECT count(*)::int FROM control.zillas) AS zillas,
              (SELECT count(*)::int FROM control.locations) AS locations`,
    );
    expect(counts.rows[0]).toEqual({ cities: 11, zillas: 64, locations: 572 });
    const first = await admin.query<{ id: number; name_en: string }>(
      'SELECT id, name_en FROM control.zillas ORDER BY id LIMIT 1',
    );
    expect(first.rows[0]).toEqual({ id: 1, name_en: 'Bagerhat' });
    const perCity = await admin.query<{ city_code: string; total: number }>(
      `SELECT city_code, count(*)::int AS total FROM control.locations
       WHERE city_code IS NOT NULL GROUP BY city_code ORDER BY city_code`,
    );
    expect(Object.fromEntries(perCity.rows.map((row) => [row.city_code, row.total]))).toEqual({
      barishal: 1,
      chattogram: 15,
      cumilla: 2,
      dhaka: 49,
      gazipur: 1,
      khulna: 8,
      mymensingh: 1,
      narayanganj: 2,
      rajshahi: 6,
      rangpur: 1,
      sylhet: 1,
    });
  });
});
