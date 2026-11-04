import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { CATALOGUE_CACHE_SETTINGS } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.5, agreed 2026-10-30: combo packs -- a combo made of other products' variants, a part fixed or a
// choice, holding no stock of its own and in stock by what its parts can make (CMB-01, CMB-02, CMB-08, CMB-10); on an
// order, each combo its components, held, shipped with their serials and taken back whole (CMB-03 to CMB-05); every
// sale in stock history naming its order and its combo (CMB-05); its weight and delivery (CMB-07); and on the storefront,
// what is inside and what it saves (CMB-06, CMB-09). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_combos_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';
const API_HOST = 'api.localhost';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'combos-e2e-otp-secret-0123456789abcdefghij';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    // The version is read again on every request here, so a product made just before shows at once.
    .overrideProvider(CATALOGUE_CACHE_SETTINGS)
    .useValue({ maxBytes: 100 * 1024 * 1024, maxEntryBytes: 10 * 1024 * 1024, versionMs: 1 })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface ComboPart {
  position: number;
  quantity: string;
  variants: { variantId: string; productName: string; label: string; available: boolean }[];
}

interface Combo {
  id: string;
  slug: string;
  kind: string;
  stockTracking: string;
  variants: { id: string }[];
  parts: ComboPart[];
}

interface Component {
  partPosition: number;
  variantId: string | null;
  productName: string;
  attributes: { value: string }[];
  quantity: string;
}

interface Order {
  id: string;
  orderNumber: string;
  trackingId: string;
  status: string;
  fulfillmentStatus: string;
  items: { id: string; productName: string; unitPrice: string; components: Component[] }[];
  history: { field: string; note: string | null }[];
}

interface StockRead {
  state: string;
  combo: {
    canMake: number | null;
    issues: { position: number; productName: string; reason: string }[];
  } | null;
}

interface Locations {
  zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}
let locations: Locations | null = null;

async function delivery(shop: ShopClient) {
  if (!locations) locations = (await shop.get('/locations')).body as Locations;
  const mirpur = locations.zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  return {
    customerName: 'Rahima Akter',
    phone: `017${String(randomInt(10_000_000, 99_999_999))}`,
    locationId: mirpur?.id,
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
    variants: [{ optionIds: [], ...(stock > 0 ? { openingStock: stock } : {}) }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

/** A product in sizes M and L, each with this much stock and, in that order, anything of its own. */
async function sized(
  shop: ShopClient,
  name: string,
  price: number,
  stock: number,
  own: Record<string, unknown>[] = [],
): Promise<{ id: string; m: string; l: string }> {
  const attributes = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const size = attributes.find((row) => row.name === 'Size' && row.scope === 'platform')?.id ?? '';
  const options = await shop.post(`/attributes/${size}/options/batch`, { values: ['M', 'L'] });
  const ids = (options.body as { id: string }[]).map((row) => row.id);
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variantAttributes: [{ attributeId: size, optionIds: ids }],
    variants: ids.map((id, at) => ({ optionIds: [id], openingStock: stock, ...own[at] })),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string; optionIds: string[] }[] };
  const of = (option: string | undefined) =>
    body.variants.find((variant) => variant.optionIds[0] === option)?.id ?? '';
  return { id: body.id, m: of(ids[0]), l: of(ids[1]) };
}

async function combo(
  shop: ShopClient,
  name: string,
  price: number,
  parts: { quantity: number; variantIds: string[] }[],
): Promise<Combo & { variantId: string }> {
  const made = await shop.post('/products', { name, basePrice: price, kind: 'combo', parts });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as Combo;
  return { ...body, variantId: body.variants[0]?.id ?? '' };
}

function order(shop: ShopClient, items: unknown[]): Promise<HttpResult> {
  return delivery(shop).then((to) =>
    postJson(port, '/orders', { ...to, items }, shop.headers({ 'idempotency-key': randomUUID() })),
  );
}

async function placed(shop: ShopClient, items: unknown[]): Promise<Order> {
  const made = await order(shop, items);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

async function shipped(shop: ShopClient, placedOrder: Order, body: Record<string, unknown> = {}) {
  const sent = await shop.post(`/orders/${placedOrder.id}/ship`, {
    courierName: 'Steadfast',
    trackingCode: 'SF-1001',
    ...body,
  });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  return sent.body as Order;
}

async function stockOf(shop: ShopClient, productId: string): Promise<StockRead> {
  const read = await shop.get(`/products/${productId}/stock`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as StockRead;
}

/** CCH-08, CMB-02: the state the catalogue and the feed show, as stored for the product and its one variant. */
async function stored(productId: string): Promise<string[]> {
  const result = await admin.query<{ stock_state: string }>(
    `SELECT stock_state FROM tenant.products WHERE id = $1
     UNION ALL SELECT stock_state FROM tenant.product_variants WHERE product_id = $1`,
    [productId],
  );
  return result.rows.map((row) => row.stock_state);
}

async function level(variantId: string): Promise<{ onHand: string; reserved: string }> {
  const result = await admin.query<{ on_hand: string; reserved: string }>(
    'SELECT on_hand::text, reserved::text FROM tenant.stock_levels WHERE variant_id = $1',
    [variantId],
  );
  const row = result.rows[0];
  return { onHand: row?.on_hand ?? '0.000', reserved: row?.reserved ?? '0.000' };
}

/** CMB-02, INV-19: the number the catalogue's caches are keyed by. */
async function catalogueVersion(tenantId: string): Promise<number> {
  const result = await admin.query<{ version: string }>(
    'SELECT version FROM tenant.catalogue_state WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(result.rows[0]?.version ?? 0);
}

async function websiteKey(shop: ShopClient): Promise<string> {
  const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { key: string }).key;
}

/** A shopper's order, as the shop's website sends it. */
async function publicOrder(shop: ShopClient, key: string, items: unknown[]): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/orders',
    { ...(await delivery(shop)), items },
    {
      host: API_HOST,
      authorization: `Bearer ${key}`,
      origin: SITE,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
  );
}

/** CMB-09, FED-02: the shop's Meta catalog feed by its columns, as Meta's fetcher reads it; nothing here is quoted. */
async function feedOf(shop: ShopClient): Promise<Record<string, string>[]> {
  const link = await shop.get('/catalog-feed');
  expect(link.status, JSON.stringify(link.body)).toBe(200);
  const text = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: new URL((link.body as { url: string }).url).pathname,
        method: 'GET',
        headers: { host: API_HOST },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
  const [header, ...lines] = text.split('\n').map((line) => line.split(','));
  return lines.map((cells) =>
    Object.fromEntries((header ?? []).map((name, at) => [name, cells[at] ?? ''])),
  );
}

describeIfDatabase('a combo made of its parts (CMB-01, CMB-02, CMB-08, CMB-10)', () => {
  it('makes a combo of fixed and choice parts that holds no stock, in stock by what its parts can make', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 4);
    const shirt = await sized(shop, 'T-shirt', 450, 3);
    const pack = await combo(shop, 'Skincare combo', 1000, [
      { quantity: 2, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [shirt.m, shirt.l] },
    ]);
    expect(pack).toMatchObject({ kind: 'combo', stockTracking: 'not_tracked' });
    expect(pack.variants).toHaveLength(1);
    expect(
      pack.parts.map((part) => [
        part.position,
        part.quantity,
        part.variants.map((variant) => variant.variantId),
      ]),
    ).toEqual([
      [1, '2.000', [toner.variantId]],
      [2, '1.000', [shirt.m, shirt.l]],
    ]);
    // CMB-01: a combo stays one, and a product a product.
    const backToProduct = await shop.patch(`/products/${pack.id}`, { kind: 'standard' });
    expect(backToProduct.status).toBe(400);
    expect(fieldsOf(backToProduct)).toEqual({ kind: 'not_allowed' });
    const intoCombo = await shop.patch(`/products/${toner.id}`, { kind: 'combo' });
    expect(intoCombo.status).toBe(400);
    expect(fieldsOf(intoCombo)).toEqual({ kind: 'not_allowed' });
    // Two Toners a combo out of four on the shelf make two, whatever the shirts allow: low against 5.
    expect((await stockOf(shop, pack.id)).combo).toEqual({
      canMake: 2,
      issues: [],
      limitedBy: { position: 1, productName: 'Toner', available: '4.000' },
    });
    expect(await stored(pack.id)).toEqual(['low', 'low']);
    expect((await stockOf(shop, toner.id)).combo).toBeNull();
    // Three Toners held for an order leave one: no combo can be made, and the catalogue shows it out.
    await placed(shop, [{ variantId: toner.variantId, quantity: 3 }]);
    expect((await stockOf(shop, pack.id)).combo).toEqual({
      canMake: 0,
      issues: [],
      limitedBy: { position: 1, productName: 'Toner', available: '1.000' },
    });
    expect(await stored(pack.id)).toEqual(['out', 'out']);
  });

  it('shows what its scarcest part can make, and selling the last of that part turns it out and moves the catalogue version (CMB-02)', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const cleanser = await product(shop, 'Cleanser', 300, 5);
    const toner = await product(shop, 'Toner', 400, 3);
    const serum = await product(shop, 'Serum', 600, 8);
    const pack = await combo(shop, 'Skincare combo', 1100, [
      { quantity: 1, variantIds: [cleanser.variantId] },
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ]);
    expect((await stockOf(shop, pack.id)).combo?.canMake).toBe(3);
    const start = await catalogueVersion(shop.tenantId);

    // INV-19: two sold leave the Toner low and the combo low, so no state moved and neither did the version.
    await shipped(shop, await placed(shop, [{ variantId: toner.variantId, quantity: 2 }]));
    expect((await stockOf(shop, pack.id)).combo?.canMake).toBe(1);
    expect(await stored(pack.id)).toEqual(['low', 'low']);
    expect(await catalogueVersion(shop.tenantId)).toBe(start);

    await shipped(shop, await placed(shop, [{ variantId: toner.variantId, quantity: 1 }]));
    expect((await stockOf(shop, pack.id)).combo?.canMake).toBe(0);
    expect(await stored(pack.id)).toEqual(['out', 'out']);
    expect(await catalogueVersion(shop.tenantId)).toBeGreaterThan(start);
  });

  it("moves the catalogue version for the combo's state alone, its part's own staying as it was (CMB-02)", async () => {
    const shop = await openShop(port, texts, 'cmb');
    // Twenty-two Soaps at twenty a combo make one; three sold leave nineteen, still in stock, and no combo.
    const soap = await product(shop, 'Soap', 100, 22);
    const pack = await combo(shop, 'Soap crate', 1500, [
      { quantity: 20, variantIds: [soap.variantId] },
    ]);
    expect(await stored(pack.id)).toEqual(['low', 'low']);
    const start = await catalogueVersion(shop.tenantId);
    await placed(shop, [{ variantId: soap.variantId, quantity: 3 }]);
    expect(await stored(soap.id)).toEqual(['in', 'in']);
    expect(await stored(pack.id)).toEqual(['out', 'out']);
    expect(await catalogueVersion(shop.tenantId)).toBe(start + 1);
  });

  it('counts a combo as one product toward the plan, refusing one at the limit (CMB-10)', async () => {
    const shop = await openShop(port, texts, 'cmb');
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', '3', 'test', gen_random_uuid())`,
      [shop.tenantId],
    );
    const toner = await product(shop, 'Toner', 400, 4);
    const serum = await product(shop, 'Serum', 600, 3);
    const parts = [
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ];
    await combo(shop, 'Skincare combo', 900, parts);
    const refused = await shop.post('/products', {
      name: 'Second combo',
      basePrice: 900,
      kind: 'combo',
      parts,
    });
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');
    expect(errorOf(refused).details).toMatchObject({ products: 3 });
  });

  it('takes ten parts and refuses an eleventh (CMB-10)', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const parts: { quantity: number; variantIds: string[] }[] = [];
    for (let n = 1; n <= 11; n += 1) {
      const item = await product(shop, `Item ${String(n)}`, 100, 5);
      parts.push({ quantity: 1, variantIds: [item.variantId] });
    }
    const pack = await combo(shop, 'Ten parts', 900, parts.slice(0, 10));
    expect(pack.parts).toHaveLength(10);
    const made = await shop.post('/products', {
      name: 'Eleven parts',
      basePrice: 900,
      kind: 'combo',
      parts,
    });
    expect(made.status).toBe(400);
    expect(fieldsOf(made)).toEqual({ parts: 'too_many' });
    const changed = await shop.patch(`/products/${pack.id}`, { parts });
    expect(changed.status).toBe(400);
    expect(fieldsOf(changed)).toEqual({ parts: 'too_many' });
  });

  it('refuses what a combo may not be: its own variants or stock, a combo inside, a part twice, half a choice', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 4);
    const serum = await product(shop, 'Serum', 600, 6);
    const pack = await combo(shop, 'Skincare combo', 900, [
      { quantity: 1, variantIds: [toner.variantId] },
    ]);
    const attempt = (body: Record<string, unknown>) =>
      shop.post('/products', { name: 'Bad combo', basePrice: 100, kind: 'combo', ...body });

    const withVariants = await attempt({
      parts: [{ quantity: 1, variantIds: [toner.variantId] }],
      variants: [{ optionIds: [], openingStock: 2 }],
    });
    expect(withVariants.status).toBe(400);
    expect(fieldsOf(withVariants)).toEqual({ variants: 'not_allowed' });
    expect(fieldsOf(await attempt({}))).toEqual({ parts: 'required' });
    const inside = await attempt({ parts: [{ quantity: 1, variantIds: [pack.variantId] }] });
    expect(fieldsOf(inside)).toEqual({ 'parts.0.variantIds.0': 'not_allowed' });
    const twice = await attempt({
      parts: [{ quantity: 1, variantIds: [toner.variantId, toner.variantId] }],
    });
    expect(fieldsOf(twice)).toEqual({ 'parts.0.variantIds.1': 'not_allowed' });
    const half = await attempt({
      parts: [{ quantity: 1.5, variantIds: [toner.variantId, serum.variantId] }],
    });
    expect(fieldsOf(half)).toEqual({ 'parts.0.quantity': 'not_whole_number' });
    const missing = await attempt({ parts: [{ quantity: 1, variantIds: [randomUUID()] }] });
    expect(fieldsOf(missing)).toEqual({ 'parts.0.variantIds.0': 'not_found' });

    const plain = await shop.post('/products', {
      name: 'Cleanser',
      basePrice: 300,
      variants: [{ optionIds: [] }],
      parts: [{ quantity: 1, variantIds: [toner.variantId] }],
    });
    expect(fieldsOf(plain)).toEqual({ parts: 'not_allowed' });
    const partsOnPlain = await shop.patch(`/products/${serum.id}`, {
      parts: [{ quantity: 1, variantIds: [toner.variantId] }],
    });
    expect(partsOnPlain.status).toBe(400);
    const counted = await shop.patch(`/products/${pack.id}`, { stockTracking: 'tracked' });
    expect(counted.status).toBe(400);
    const split = await shop.put(`/products/${pack.id}/variants`, {
      variantAttributes: [],
      variants: [{ optionIds: [] }],
    });
    expect(split.status).toBe(400);
    expect(errorOf(split).code).toBe('validation_error');
  });

  it('goes out when a part goes off sale, keeps that part from being deleted for good, and duplicates with its parts', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 4);
    const serum = await product(shop, 'Serum', 600, 3);
    const pack = await combo(shop, 'Skincare combo', 900, [
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ]);
    expect((await stockOf(shop, pack.id)).combo).toEqual({
      canMake: 3,
      issues: [],
      limitedBy: { position: 2, productName: 'Serum', available: '3.000' },
    });

    // CMB-08 (Slice 4.8c): it says exactly what happened to the part.
    expect((await shop.patch(`/products/${serum.id}`, { active: false })).status).toBe(200);
    expect((await stockOf(shop, pack.id)).combo?.issues).toEqual([
      { position: 2, productName: 'Serum', reason: 'part_off_sale' },
    ]);
    expect((await shop.patch(`/products/${serum.id}`, { active: true })).status).toBe(200);

    // Stock lists the combos apart from what holds stock of its own (Slice 4.8c).
    const combos = await shop.get('/inventory/stock?kind=combo');
    expect(combos.status).toBe(200);
    expect(combos.body).toMatchObject({ total: 1, counts: { all: 1 } });
    const ordinary = await shop.get('/inventory/stock?kind=standard');
    expect(ordinary.body).toMatchObject({ total: 2, counts: { all: 2 } });

    expect((await shop.delete(`/products/${serum.id}`)).status).toBe(200);
    expect(await stockOf(shop, pack.id)).toMatchObject({
      state: 'out',
      combo: {
        canMake: 0,
        issues: [{ position: 2, productName: 'Serum', reason: 'part_archived' }],
        limitedBy: null,
      },
    });
    expect(await stored(pack.id)).toEqual(['out', 'out']);
    const forGood = await shop.delete(`/products/${serum.id}?hard=true`);
    expect(forGood.status).toBe(409);
    expect(errorOf(forGood).details).toEqual({
      combos: [{ id: pack.id, name: 'Skincare combo' }],
    });

    expect((await shop.post(`/products/${serum.id}/restore`, {})).status).toBe(201);
    expect((await stockOf(shop, pack.id)).combo).toEqual({
      canMake: 3,
      issues: [],
      limitedBy: { position: 2, productName: 'Serum', available: '3.000' },
    });
    expect(await stored(pack.id)).toEqual(['low', 'low']);

    const copy = await shop.post(`/products/${pack.id}/duplicate`, {});
    expect(copy.status, JSON.stringify(copy.body)).toBe(201);
    const copied = copy.body as Combo;
    expect(copied.kind).toBe('combo');
    expect(copied.parts.map((part) => part.variants.map((variant) => variant.variantId))).toEqual([
      [toner.variantId],
      [serum.variantId],
    ]);

    // CMB-08: taken out of both combos, the part can go for good.
    for (const id of [pack.id, copied.id]) {
      const without = await shop.patch(`/products/${id}`, {
        parts: [{ quantity: 1, variantIds: [toner.variantId] }],
      });
      expect(without.status, JSON.stringify(without.body)).toBe(200);
    }
    const removed = await shop.delete(`/products/${serum.id}?hard=true`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect((await shop.get(`/products/${serum.id}`)).status).toBe(404);
  });
});

describeIfDatabase('a combo on an order (CMB-03, CMB-04)', () => {
  it('holds each component for the combos ordered, choices picked unit by unit, kept on the line through an edit', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 10);
    const shirt = await sized(shop, 'T-shirt', 450, 3);
    const pack = await combo(shop, 'Gift combo', 1100, [
      { quantity: 2, variantIds: [toner.variantId] },
      { quantity: 2, variantIds: [shirt.m, shirt.l] },
    ]);
    const made = await placed(shop, [
      {
        variantId: pack.variantId,
        quantity: 2,
        choices: [{ part: 2, variantIds: [shirt.m, shirt.l] }],
      },
    ]);
    const [line] = made.items;
    expect(line).toMatchObject({ productName: 'Gift combo', unitPrice: '1100.00' });
    expect(
      line?.components.map((component) => [
        component.partPosition,
        component.variantId,
        component.productName,
        component.quantity,
      ]),
    ).toEqual([
      [1, toner.variantId, 'Toner', '2.000'],
      [2, shirt.m, 'T-shirt', '1.000'],
      [2, shirt.l, 'T-shirt', '1.000'],
    ]);
    expect((await level(toner.variantId)).reserved).toBe('4.000');
    expect((await level(shirt.m)).reserved).toBe('2.000');
    expect((await level(shirt.l)).reserved).toBe('2.000');

    // The combo's parts change; the open order keeps what it was ordered with (agreed 2026-10-30).
    const changed = await shop.patch(`/products/${pack.id}`, {
      parts: [{ quantity: 1, variantIds: [toner.variantId] }],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    const edited = await shop.patch(`/orders/${made.id}`, {
      items: [{ lineId: line?.id, variantId: pack.variantId, quantity: 2 }],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((edited.body as Order).items[0]?.components).toHaveLength(3);
    expect((await level(toner.variantId)).reserved).toBe('4.000');
    expect((await level(shirt.m)).reserved).toBe('2.000');
  });

  it('refuses choices that do not fit, and a combo whose component is short, naming the combo', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 10);
    const shirt = await sized(shop, 'T-shirt', 450, 1);
    const pack = await combo(shop, 'Gift combo', 1100, [
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 2, variantIds: [shirt.m, shirt.l] },
    ]);
    const item = (extra: Record<string, unknown>) => ({
      variantId: pack.variantId,
      quantity: 1,
      ...extra,
    });

    expect(fieldsOf(await order(shop, [item({})]))).toEqual({ 'items.0.choices': 'required' });
    const short = await order(shop, [item({ choices: [{ part: 2, variantIds: [shirt.m] }] })]);
    expect(fieldsOf(short)).toEqual({ 'items.0.choices': 'required' });
    const stranger = await order(shop, [
      item({ choices: [{ part: 2, variantIds: [shirt.m, toner.variantId] }] }),
    ]);
    expect(fieldsOf(stranger)).toEqual({ 'items.0.choices.0.variantIds.1': 'not_found' });
    const fixed = await order(shop, [
      item({
        choices: [
          { part: 1, variantIds: [toner.variantId] },
          { part: 2, variantIds: [shirt.m, shirt.l] },
        ],
      }),
    ]);
    expect(fieldsOf(fixed)).toEqual({ 'items.0.choices.0.part': 'not_allowed' });
    const plain = await order(shop, [
      { variantId: toner.variantId, quantity: 1, choices: [{ part: 1, variantIds: [shirt.m] }] },
    ]);
    expect(fieldsOf(plain)).toEqual({ 'items.0.choices': 'not_allowed' });

    // Two Ms a combo, one on the shelf.
    const none = await order(shop, [
      item({ choices: [{ part: 2, variantIds: [shirt.m, shirt.m] }] }),
    ]);
    expect(none.status).toBe(409);
    expect(errorOf(none).details).toMatchObject({
      productId: pack.id,
      variantId: pack.variantId,
      component: { variantId: shirt.m },
    });
    expect(errorOf(none).message).toContain('Gift combo');
    expect((await level(toner.variantId)).reserved).toBe('0.000');
  });

  it('shows a past order as it was after a part is renamed and repriced and it and the combo are deleted for good', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const cleanser = await product(shop, 'Cleanser', 900, 5);
    const toner = await product(shop, 'Toner', 800, 5);
    const serum = await sized(shop, 'Serum', 1100, 5);
    const pack = await combo(shop, 'Skincare combo', 2450, [
      { quantity: 1, variantIds: [cleanser.variantId] },
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.m, serum.l] },
    ]);
    const made = await shipped(
      shop,
      await placed(shop, [
        { variantId: pack.variantId, quantity: 1, choices: [{ part: 3, variantIds: [serum.l] }] },
      ]),
    );
    expect((await shop.post(`/orders/${made.id}/deliver`, {})).status).toBe(200);

    const renamed = await shop.patch(`/products/${serum.id}`, {
      name: 'Serum Plus',
      basePrice: 1500,
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    const repriced = await shop.patch(`/products/${pack.id}`, { basePrice: 3000 });
    expect(repriced.status, JSON.stringify(repriced.body)).toBe(200);
    expect((await shop.delete(`/products/${pack.id}?hard=true`)).status).toBe(200);
    expect((await shop.delete(`/products/${serum.id}?hard=true`)).status).toBe(200);

    const read = (await shop.get(`/orders/${made.id}`)).body as Order;
    const [line] = read.items;
    expect(line).toMatchObject({ productName: 'Skincare combo', unitPrice: '2450.00' });
    expect(
      line?.components.map((component) => [
        component.productName,
        component.attributes.map((row) => row.value),
        component.quantity,
      ]),
    ).toEqual([
      ['Cleanser', [], '1.000'],
      ['Toner', [], '1.000'],
      ['Serum', ['L'], '1.000'],
    ]);
    // ORD-46: and its tracking page, from the same lines.
    const tracked = await sendExact(port, 'GET', `/v1/track/${made.trackingId}`, undefined, {
      host: API_HOST,
      authorization: `Bearer ${await websiteKey(shop)}`,
      origin: SITE,
    });
    expect(tracked.status, JSON.stringify(tracked.body)).toBe(200);
    expect(tracked.body).toMatchObject({
      items: [
        {
          productName: 'Skincare combo',
          unitPrice: '2450.00',
          components: [
            { productName: 'Cleanser', attributes: [], quantity: '1.000' },
            { productName: 'Toner', attributes: [], quantity: '1.000' },
            { productName: 'Serum', attributes: [{ value: 'L' }], quantity: '1.000' },
          ],
        },
      ],
      grandTotal: '2520.00',
    });
  });

  it("holds, ships and takes back the serum an open order was made with after the combo's serum is swapped for a toner (CMB-04)", async () => {
    const shop = await openShop(port, texts, 'cmb');
    const cleanser = await product(shop, 'Cleanser', 900, 5);
    const toner = await product(shop, 'Toner', 800, 5);
    const serum = await product(shop, 'Serum', 1100, 5);
    const pack = await combo(shop, 'Skincare combo', 1800, [
      { quantity: 1, variantIds: [cleanser.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ]);
    const made = await placed(shop, [{ variantId: pack.variantId, quantity: 1 }]);
    const swapped = await shop.patch(`/products/${pack.id}`, {
      parts: [
        { quantity: 1, variantIds: [cleanser.variantId] },
        { quantity: 1, variantIds: [toner.variantId] },
      ],
    });
    expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
    expect((await level(serum.variantId)).reserved).toBe('1.000');
    expect((await level(toner.variantId)).reserved).toBe('0.000');

    const sent = await shipped(shop, made);
    expect(sent.items[0]?.components.map((component) => component.productName)).toEqual([
      'Cleanser',
      'Serum',
    ]);
    expect(await level(serum.variantId)).toEqual({ onHand: '4.000', reserved: '0.000' });
    expect(await level(toner.variantId)).toEqual({ onHand: '5.000', reserved: '0.000' });

    expect((await shop.post(`/orders/${made.id}/deliver`, {})).status).toBe(200);
    const back = await shop.post(`/orders/${made.id}/returns`, {
      items: [{ lineId: sent.items[0]?.id, sellable: 1, damaged: 0 }],
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect((await level(serum.variantId)).onHand).toBe('5.000');
    expect((await level(toner.variantId)).onHand).toBe('5.000');

    // A combo ordered now takes the parts as they are.
    await placed(shop, [{ variantId: pack.variantId, quantity: 1 }]);
    expect((await level(toner.variantId)).reserved).toBe('1.000');
    expect((await level(serum.variantId)).reserved).toBe('0.000');
  });
});

describeIfDatabase("a combo's weight and delivery (CMB-07)", () => {
  it('weighs its parts unless given its own weight, and with no charge of its own is charged the zone', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const cleanser = await product(shop, 'Cleanser', 300, 9, { weightKg: 0.2 });
    const toner = await product(shop, 'Toner', 400, 9, { weightKg: 0.2 });
    const serum = await product(shop, 'Serum', 600, 9, { weightKg: 0.2 });
    const parts = [
      { quantity: 1, variantIds: [cleanser.variantId] },
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ];
    const pack = await combo(shop, 'Skincare combo', 1100, parts);
    // The editor's figure and the line agree, and three of one 200 g item weigh the same.
    const quoted = await shop.post('/products/combo-quote', { parts });
    expect(quoted.body).toMatchObject({ weightKg: '0.600' });
    const threeOfOne = await shop.post('/products/combo-quote', {
      parts: [{ quantity: 3, variantIds: [cleanser.variantId] }],
    });
    expect(threeOfOne.body).toMatchObject({ weightKg: '0.600' });

    const made = await placed(shop, [{ variantId: pack.variantId, quantity: 1 }]);
    expect(made.items[0]).toMatchObject({
      weightKg: '0.600',
      ownDeliveryCharge: null,
      deliveryCharge: '0.00',
    });
    // Mirpur is in the shop's home zone, at its 70 TK.
    expect(made).toMatchObject({ deliveryCharge: '70.00', deliveryZone: { charge: '70.00' } });

    const set = await shop.patch(`/products/${pack.id}`, { weightKg: 0.5 });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const heavier = await placed(shop, [{ variantId: pack.variantId, quantity: 1 }]);
    expect(heavier.items[0]).toMatchObject({ weightKg: '0.500' });
    expect(heavier).toMatchObject({ deliveryCharge: '70.00' });
  });

  it('counts a choice part at its heaviest allowed variant, whichever is chosen', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const cleanser = await product(shop, 'Cleanser', 300, 9, { weightKg: 0.2 });
    const shirt = await sized(shop, 'T-shirt', 450, 5, [{ weightKg: 0.25 }, { weightKg: 0.4 }]);
    const parts = [
      { quantity: 1, variantIds: [cleanser.variantId] },
      { quantity: 2, variantIds: [shirt.m, shirt.l] },
    ];
    // 0.2 kg, and two shirts at the L's 0.4 kg.
    const quoted = await shop.post('/products/combo-quote', { parts });
    expect(quoted.body).toMatchObject({ weightKg: '1.000' });
    const pack = await combo(shop, 'Gift combo', 1100, parts);
    const made = await placed(shop, [
      {
        variantId: pack.variantId,
        quantity: 1,
        choices: [{ part: 2, variantIds: [shirt.m, shirt.m] }],
      },
    ]);
    expect(made.items[0]).toMatchObject({ weightKg: '1.000' });
  });
});

describeIfDatabase('a combo shipped and returned (CMB-05)', () => {
  it("ships with each serial-numbered component's serials, and stock history names the order and the combo", async () => {
    const shop = await openShop(port, texts, 'cmb');
    const phone = await product(shop, 'Phone', 15000, 0, {
      serialTracked: true,
      serialFormat: 'any',
    });
    const added = await shop.post(
      `/products/${phone.id}/variants/${phone.variantId}/stock-additions`,
      { quantity: 2, serials: ['SN-A', 'SN-B'] },
    );
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const cover = await product(shop, 'Cover', 300, 5);
    const pack = await combo(shop, 'Phone bundle', 15000, [
      { quantity: 1, variantIds: [phone.variantId] },
      { quantity: 1, variantIds: [cover.variantId] },
    ]);
    const made = await placed(shop, [{ variantId: pack.variantId, quantity: 1 }]);
    const lineId = made.items[0]?.id;

    const unnamed = await shop.post(`/orders/${made.id}/ship`, {
      courierName: 'Steadfast',
      trackingCode: 'SF-1001',
    });
    expect(unnamed.status).toBe(409);
    const stray = await shop.post(`/orders/${made.id}/ship`, {
      courierName: 'Steadfast',
      trackingCode: 'SF-1001',
      serials: [{ lineId, variantId: randomUUID(), serials: ['SN-A'] }],
    });
    expect(fieldsOf(stray)).toEqual({ 'serials.0.variantId': 'not_found' });
    await shipped(shop, made, {
      serials: [{ lineId, variantId: phone.variantId, serials: ['SN-A'] }],
    });
    const sold = await admin.query<{ serial: string; sold_order_id: string }>(
      `SELECT serial, sold_order_id FROM tenant.serial_numbers WHERE tenant_id = $1 AND status = 'sold'`,
      [shop.tenantId],
    );
    expect(sold.rows).toEqual([{ serial: 'SN-A', sold_order_id: made.id }]);
    expect(await level(cover.variantId)).toEqual({ onHand: '4.000', reserved: '0.000' });

    // A sale on its own names its order and no combo.
    const alone = await placed(shop, [{ variantId: cover.variantId, quantity: 1 }]);
    await shipped(shop, alone);
    const history = await shop.get(
      `/products/${cover.id}/variants/${cover.variantId}/stock-history`,
    );
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    const movements = (
      history.body as {
        movements: {
          reason: string;
          order: { id: string; number: string | null; combo: string | null } | null;
        }[];
      }
    ).movements;
    expect(movements.map((movement) => [movement.reason, movement.order])).toEqual([
      ['sale', { id: alone.id, number: alone.orderNumber, combo: null }],
      ['sale', { id: made.id, number: made.orderNumber, combo: 'Phone bundle' }],
      ['initial', null],
    ]);
  });

  it('takes a combo back whole, each component sellable or named damaged', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 10);
    const serum = await product(shop, 'Serum', 600, 10);
    const pack = await combo(shop, 'Skincare combo', 1200, [
      { quantity: 2, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ]);
    const lamp = await product(shop, 'Lamp', 300, 5);
    const made = await shipped(
      shop,
      await placed(shop, [
        { variantId: pack.variantId, quantity: 2 },
        { variantId: lamp.variantId, quantity: 1 },
      ]),
    );
    await shop.post(`/orders/${made.id}/deliver`, {});
    const [comboLine, lampLine] = made.items;
    expect(await level(toner.variantId)).toEqual({ onHand: '6.000', reserved: '0.000' });
    expect(await level(serum.variantId)).toEqual({ onHand: '8.000', reserved: '0.000' });
    const back = (items: unknown[], note?: string) =>
      shop.post(`/orders/${made.id}/returns`, { items, ...(note ? { note } : {}) });

    const split = await back([{ lineId: comboLine?.id, sellable: 1, damaged: 1 }]);
    expect(fieldsOf(split)).toEqual({ 'items.0.sellable': 'not_allowed' });
    // CMB-05: half a combo does not come back.
    const half = await back([{ lineId: comboLine?.id, sellable: 0.5, damaged: 0 }]);
    expect(half.status).toBe(400);
    expect(fieldsOf(half)).toEqual({ 'items.0.sellable': 'not_allowed' });
    const stray = await back([
      {
        lineId: comboLine?.id,
        sellable: 1,
        damaged: 0,
        components: [{ variantId: lamp.variantId, damaged: 1 }],
      },
    ]);
    expect(fieldsOf(stray)).toEqual({ 'items.0.components.0.variantId': 'not_found' });
    const onLamp = await back([
      {
        lineId: lampLine?.id,
        sellable: 1,
        damaged: 0,
        components: [{ variantId: toner.variantId, damaged: 0 }],
      },
    ]);
    expect(fieldsOf(onLamp)).toEqual({ 'items.0.components': 'not_allowed' });

    const first = await back([
      {
        lineId: comboLine?.id,
        sellable: 1,
        damaged: 0,
        components: [{ variantId: serum.variantId, damaged: 1 }],
      },
    ]);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ fulfillmentStatus: 'delivered' });
    // One combo back: both Toners on the shelf again, its Serum damaged and kept off it.
    expect((await level(toner.variantId)).onHand).toBe('8.000');
    expect((await level(serum.variantId)).onHand).toBe('8.000');
    const tooMany = await back([{ lineId: comboLine?.id, sellable: 2, damaged: 0 }]);
    expect(tooMany.status).toBe(409);

    const rest = await back(
      [
        { lineId: comboLine?.id, sellable: 1, damaged: 0 },
        { lineId: lampLine?.id, sellable: 1, damaged: 0 },
      ],
      'Changed mind',
    );
    expect(rest.status, JSON.stringify(rest.body)).toBe(200);
    const returned = rest.body as Order;
    expect(returned).toMatchObject({ fulfillmentStatus: 'returned', status: 'returned' });
    expect(returned.history.filter((row) => row.field === 'return').map((row) => row.note)).toEqual(
      [
        'Skincare combo: 1.000 back, Serum 1.000 damaged',
        'Skincare combo: 1.000 back; Lamp: 1.000 sellable, 0.000 damaged; Changed mind',
      ],
    );
    expect((await level(toner.variantId)).onHand).toBe('10.000');
    expect((await level(serum.variantId)).onHand).toBe('9.000');
  });
});

describeIfDatabase('a combo on the storefront (CMB-06, CMB-09)', () => {
  it('shows what is inside, each choice with its variants, and what the combo saves; a shopper orders it', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const key = (made.body as { key: string }).key;
    const toner = await product(shop, 'Toner', 400, 4);
    const shirt = await sized(shop, 'T-shirt', 450, 3);
    const pack = await combo(shop, 'Skincare combo', 1000, [
      { quantity: 2, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [shirt.m, shirt.l] },
    ]);
    const read = (slug: string) =>
      sendExact(port, 'GET', `/v1/catalogue/products/${slug}`, undefined, {
        host: API_HOST,
        authorization: `Bearer ${key}`,
        origin: SITE,
      });

    const detail = await read(pack.slug);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    const shown = (
      detail.body as {
        combo: {
          saving: string | null;
          parts: (Omit<ComboPart, 'variants'> & {
            productName: string;
            choice: boolean;
            variants: { variantId: string; label: string; available: boolean }[];
          })[];
        } | null;
      }
    ).combo;
    // Two Toners at 400 and the cheapest shirt at 450, bought apart, cost 1250.
    expect(shown?.saving).toBe('250.00');
    expect(
      shown?.parts.map((part) => [
        part.position,
        part.quantity,
        part.productName,
        part.choice,
        part.variants.map((variant) => [variant.variantId, variant.label, variant.available]),
      ]),
    ).toEqual([
      [1, '2.000', 'Toner', false, [[toner.variantId, '', true]]],
      [
        2,
        '1.000',
        'T-shirt',
        true,
        [
          [shirt.m, 'M', true],
          [shirt.l, 'L', true],
        ],
      ],
    ]);
    const plain = await read(
      ((await shop.get(`/products/${toner.id}`)).body as { slug: string }).slug,
    );
    expect((plain.body as { combo: unknown }).combo).toBeNull();

    // A shopper orders it with the choice made, and the component is held like any item.
    const ordered = await sendExact(
      port,
      'POST',
      '/v1/orders',
      {
        ...(await delivery(shop)),
        items: [
          { variantId: pack.variantId, quantity: 1, choices: [{ part: 2, variantIds: [shirt.l] }] },
        ],
      },
      {
        host: API_HOST,
        authorization: `Bearer ${key}`,
        origin: SITE,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
    );
    expect(ordered.status, JSON.stringify(ordered.body)).toBe(201);
    expect((await level(toner.variantId)).reserved).toBe('2.000');
    expect((await level(shirt.l)).reserved).toBe('1.000');
    expect((await level(shirt.m)).reserved).toBe('0.000');

    // Slice 4.8e: its tracking names the parts as they were ordered, the choice made.
    const tracked = await sendExact(
      port,
      'GET',
      `/v1/track/${(ordered.body as { trackingId: string }).trackingId}`,
      undefined,
      { host: API_HOST, authorization: `Bearer ${key}`, origin: SITE },
    );
    expect(tracked.status, JSON.stringify(tracked.body)).toBe(200);
    const [item] = (
      tracked.body as {
        items: {
          components: {
            productName: string;
            attributes: { value: string }[];
            quantity: string;
          }[];
        }[];
      }
    ).items;
    expect(
      item?.components.map((part) => [
        part.productName,
        part.attributes.map((row) => row.value),
        part.quantity,
      ]),
    ).toEqual([
      ['Toner', [], '2.000'],
      ['T-shirt', ['L'], '1.000'],
    ]);
  });

  it('refuses a shopper choosing a sold-out variant, naming the combo and holding nothing (CMB-03)', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const key = await websiteKey(shop);
    const toner = await product(shop, 'Toner', 400, 4);
    const polo = await sized(shop, 'Polo', 650, 1);
    const pack = await combo(shop, 'Polo combo', 1000, [
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [polo.m, polo.l] },
    ]);
    // The last L goes to an order of its own; the M keeps the combo on sale.
    await placed(shop, [{ variantId: polo.l, quantity: 1 }]);
    const choosing = (variantId: string) => [
      { variantId: pack.variantId, quantity: 1, choices: [{ part: 2, variantIds: [variantId] }] },
    ];

    const refused = await publicOrder(shop, key, choosing(polo.l));
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(errorOf(refused).code).toBe('conflict');
    expect(errorOf(refused).message).toContain('Polo combo');
    expect((await level(toner.variantId)).reserved).toBe('0.000');
    expect((await level(polo.l)).reserved).toBe('1.000');

    const taken = await publicOrder(shop, key, choosing(polo.m));
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);
    expect((await level(toner.variantId)).reserved).toBe('1.000');
    expect((await level(polo.m)).reserved).toBe('1.000');
  });

  it("raises the saving, never the combo's price, when a part's price rises (CMB-06)", async () => {
    const shop = await openShop(port, texts, 'cmb');
    const key = await websiteKey(shop);
    const cleanser = await product(shop, 'Cleanser', 900, 5);
    const toner = await product(shop, 'Toner', 800, 5);
    const serum = await product(shop, 'Serum', 1100, 5);
    const pack = await combo(shop, 'Skincare combo', 2450, [
      { quantity: 1, variantIds: [cleanser.variantId] },
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [serum.variantId] },
    ]);
    const read = async () => {
      const answer = await sendExact(
        port,
        'GET',
        `/v1/catalogue/products/${pack.slug}`,
        undefined,
        {
          host: API_HOST,
          authorization: `Bearer ${key}`,
          origin: SITE,
        },
      );
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return answer.body as {
        minPrice: string;
        variants: { price: string }[];
        combo: { saving: string | null };
      };
    };
    // Parts worth 2,800 in a 2,450 combo.
    expect(await read()).toMatchObject({
      minPrice: '2450.00',
      variants: [{ price: '2450.00' }],
      combo: { saving: '350.00' },
    });

    const raised = await shop.patch(`/products/${serum.id}`, { basePrice: 1300 });
    expect(raised.status, JSON.stringify(raised.body)).toBe(200);
    expect(await read()).toMatchObject({
      minPrice: '2450.00',
      variants: [{ price: '2450.00' }],
      combo: { saving: '550.00' },
    });
    const sold = await placed(shop, [{ variantId: pack.variantId, quantity: 1 }]);
    expect(sold.items[0]?.unitPrice).toBe('2450.00');
  });

  it('lists each combo in the feed as one row with its own variant, however many parts and choices it has (CMB-09)', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 4);
    const polo = await sized(shop, 'Polo', 650, 5);
    const skincare = await combo(shop, 'Skincare combo', 1000, [
      { quantity: 2, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [polo.m, polo.l] },
    ]);
    const polos = await combo(shop, 'Three polos', 1700, [
      { quantity: 3, variantIds: [polo.m, polo.l] },
    ]);
    const rows = await feedOf(shop);
    for (const [pack, title, price] of [
      [skincare, 'Skincare combo', '1000.00 BDT'],
      [polos, 'Three polos', '1700.00 BDT'],
    ] as const) {
      expect(rows.filter((row) => row['item_group_id'] === pack.id)).toEqual([
        expect.objectContaining({ id: pack.variantId, title, price }),
      ]);
    }
    // Its parts stay their own products' rows, each once.
    expect(rows.map((row) => row['id']).sort()).toEqual(
      [toner.variantId, polo.m, polo.l, skincare.variantId, polos.variantId].sort(),
    );
  });
});

describeIfDatabase("New order's Add an item (Slice 4.8a, agreed 2026-10-31)", () => {
  type PickerPage = {
    products: {
      id: string;
      name: string;
      kind: string;
      available: string | null;
      variantCount: number;
    }[];
    total: number;
  };
  type PickerProduct = {
    kind: string;
    variants: { variantId: string; label: string; price: string; available: string | null }[];
    parts: {
      position: number;
      variants: { label: string; productName: string; onSale: boolean; available: string | null }[];
    }[];
  };

  it('lists the products with the units each has on sale, and a product with each variant and part', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const polo = await sized(shop, 'Polo', 650, 5);
    const toner = await product(shop, 'Toner', 400, 4);
    const cake = await product(shop, 'Cake', 900, 0, { stockTracking: 'not_tracked' });
    const pack = await combo(shop, 'Skincare combo', 900, [
      { quantity: 1, variantIds: [toner.variantId] },
      { quantity: 1, variantIds: [polo.m, polo.l] },
    ]);
    // Two Polos in M held for an order: three left in M, five in L.
    await placed(shop, [{ variantId: polo.m, quantity: 2 }]);

    const found = (await shop.get('/orders/picker?search=Polo')).body as PickerPage;
    expect(found.products).toEqual([
      expect.objectContaining({
        id: polo.id,
        name: 'Polo',
        kind: 'standard',
        variantCount: 2,
        optionNames: [['M', 'L']],
        available: '8.000',
      }),
    ]);
    const all = (await shop.get('/orders/picker')).body as PickerPage;
    const byId = new Map(all.products.map((row) => [row.id, row]));
    expect(byId.get(cake.id)?.available).toBeNull();
    // A combo's units on sale are what its parts make (CMB-02): four toners, eight polos.
    expect(byId.get(pack.id)).toMatchObject({ kind: 'combo', available: '4' });

    const shirt = (await shop.get(`/orders/picker/${polo.id}`)).body as PickerProduct;
    // Made together, M and L share a creation time: compared by label, whatever their order.
    const byLabel = <T extends { label: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.label.localeCompare(b.label));
    expect(byLabel(shirt.variants)).toEqual([
      { variantId: polo.l, label: 'L', price: '650.00', onSale: true, available: '5.000' },
      { variantId: polo.m, label: 'M', price: '650.00', onSale: true, available: '3.000' },
    ]);
    const box = (await shop.get(`/orders/picker/${pack.id}`)).body as PickerProduct;
    expect(box.kind).toBe('combo');
    expect(byLabel(box.parts[1]?.variants ?? [])).toEqual([
      expect.objectContaining({
        productName: 'Polo',
        label: 'L',
        onSale: true,
        available: '5.000',
      }),
      expect.objectContaining({
        productName: 'Polo',
        label: 'M',
        onSale: true,
        available: '3.000',
      }),
    ]);
    expect((await shop.get(`/orders/picker/${cake.id}`)).body).toMatchObject({
      variants: [expect.objectContaining({ available: null })],
    });
  });

  it('serves whoever may enter orders without stock or catalogue rights, and never another shop', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const toner = await product(shop, 'Toner', 400, 4);
    const taker = await staffWith(port, texts, admin, shop, ['orders:manage']);
    expect((await getJson(port, '/products', taker)).status).toBe(403);
    expect(((await getJson(port, '/orders/picker', taker)).body as PickerPage).total).toBe(1);
    expect((await getJson(port, `/orders/picker/${toner.id}`, taker)).status).toBe(200);
    // Starter has two seats, so the one who may only read orders is another shop's.
    const reader = await staffWith(port, texts, admin, await openShop(port, texts, 'cmb'), [
      'orders:read',
    ]);
    expect((await getJson(port, '/orders/picker', reader)).status).toBe(403);
    const other = await openShop(port, texts, 'cmb');
    expect(((await other.get('/orders/picker')).body as PickerPage).total).toBe(0);
    expect((await other.get(`/orders/picker/${toner.id}`)).status).toBe(404);
  });

  it('serves whoever may edit products too (the combo editor), with each variant on sale or not and its unit', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const polo = await sized(shop, 'Polo', 650, 5);
    const rice = await product(shop, 'Rice', 80, 25, { stockUnit: 'kg' });
    const editor = await staffWith(port, texts, admin, shop, ['products:read', 'products:manage']);
    expect((await getJson(port, '/orders', editor)).status).toBe(403);
    const page = (await getJson(port, '/orders/picker', editor)).body as PickerPage;
    expect(page.total).toBe(2);
    expect((await getJson(port, `/orders/picker/${rice.id}`, editor)).body).toMatchObject({
      stockUnit: 'kg',
      variants: [{ label: '', onSale: true, available: '25.000' }],
    });
    const off = await shop.patch(`/products/${polo.id}`, { active: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const shirt = (await getJson(port, `/orders/picker/${polo.id}`, editor)).body as PickerProduct;
    expect(shirt.variants.map((variant) => (variant as { onSale?: boolean }).onSale)).toEqual([
      false,
      false,
    ]);
  });
});

describeIfDatabase('a combo as the editor sends it (Slice 4.8c)', () => {
  it('makes one from the fields the form sends, changes its parts and delivery, and reads back each part with its unit', async () => {
    const shop = await openShop(port, texts, 'cmb');
    const polo = await sized(shop, 'Polo', 650, 5);
    const rice = await product(shop, 'Rice', 80, 25, { stockUnit: 'kg' });
    const made = await shop.post('/products', {
      name: 'Eid combo',
      basePrice: 700,
      description: null,
      categoryIds: [],
      primaryCategoryId: null,
      active: true,
      kind: 'combo',
      parts: [
        { quantity: 1, variantIds: [polo.m, polo.l] },
        { quantity: 0.5, variantIds: [rice.variantId] },
      ],
      weightKg: null,
      deliveryCharge: null,
      paymentPolicy: null,
      advanceAmount: null,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const { id } = made.body as { id: string };
    const read = (await shop.get(`/products/${id}`)).body as {
      kind: string;
      stockTracking: string;
      parts: { quantity: string; variants: { label: string; stockUnit: string }[] }[];
    };
    expect(read).toMatchObject({ kind: 'combo', stockTracking: 'not_tracked' });
    expect(read.parts.map((part) => part.quantity)).toEqual(['1.000', '0.500']);
    expect(read.parts[1]?.variants).toEqual([
      expect.objectContaining({ label: '', stockUnit: 'kg' }),
    ]);

    const changed = await shop.patch(`/products/${id}`, {
      parts: [{ quantity: 2, variantIds: [polo.m] }],
      weightKg: 1.1,
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((changed.body as { parts: unknown[] }).parts).toHaveLength(1);
  });
});

describeIfDatabase(
  'what a combo comes to as the editor has it (Slice 4.8c, agreed 2026-11-02)',
  () => {
    type Quote = {
      partsValue: string;
      saving: string | null;
      canMake: number | null;
      limitedBy: { position: number; productName: string; available: string } | null;
      issues: { position: number; productName: string; reason: string }[];
      weightKg: string | null;
      parts: { position: number; price: string; image: unknown }[];
    };

    it('adds up parts not saved anywhere: each price, bought apart, the saving, can make, what limits it, the weight', async () => {
      const shop = await openShop(port, texts, 'cmb');
      const polo = await sized(shop, 'Polo', 650, 5);
      const lungi = await product(shop, 'Lungi', 500, 6, { weightKg: 0.4 });
      const before = (await shop.get('/products')).body as { total: number };
      const quote = await shop.post('/products/combo-quote', {
        basePrice: 1000,
        parts: [
          { quantity: 1, variantIds: [polo.m, polo.l] },
          { quantity: 2, variantIds: [lungi.variantId] },
        ],
      });
      expect(quote.status, JSON.stringify(quote.body)).toBe(200);
      expect(quote.body).toEqual({
        partsValue: '1650.00',
        saving: '650.00',
        // Ten Polos across its sizes, six Lungis at two a combo.
        canMake: 3,
        limitedBy: { position: 2, productName: 'Lungi', available: '6.000' },
        issues: [],
        // The Polo has no weight, so the items give none.
        weightKg: null,
        parts: [
          { position: 1, price: '650.00', image: null },
          { position: 2, price: '1000.00', image: null },
        ],
      });
      // Nothing was made.
      expect(((await shop.get('/products')).body as { total: number }).total).toBe(before.total);
    });

    it("agrees with a saved combo's stock figures, and gives no saving without a price or above it", async () => {
      const shop = await openShop(port, texts, 'cmb');
      const toner = await product(shop, 'Toner', 400, 4);
      const lotion = await product(shop, 'Lotion', 300, 9);
      const parts = [
        { quantity: 1, variantIds: [toner.variantId] },
        { quantity: 1, variantIds: [lotion.variantId] },
      ];
      const pack = await combo(shop, 'Skincare', 600, parts);
      const stock = await stockOf(shop, pack.id);
      const drafted = (await shop.post('/products/combo-quote', { basePrice: 600, parts }))
        .body as Quote;
      expect(drafted).toMatchObject({
        canMake: stock.combo?.canMake,
        issues: stock.combo?.issues,
        saving: '100.00',
      });
      expect((await shop.post('/products/combo-quote', { parts })).body).toMatchObject({
        saving: null,
      });
      expect(
        (await shop.post('/products/combo-quote', { basePrice: 900, parts })).body,
      ).toMatchObject({ saving: null });
    });

    it('says why a part stops it, and takes part of a measured unit', async () => {
      const shop = await openShop(port, texts, 'cmb');
      const toner = await product(shop, 'Toner', 400, 4);
      const rice = await product(shop, 'Rice', 80, 25, { stockUnit: 'kg' });
      const parts = [
        { quantity: 1, variantIds: [toner.variantId] },
        { quantity: 0.5, variantIds: [rice.variantId] },
      ];
      expect((await shop.post('/products/combo-quote', { parts })).body).toMatchObject({
        partsValue: '440.00',
        canMake: 4,
        issues: [],
        parts: [{ price: '400.00' }, { price: '40.00' }],
      });
      await shop.patch(`/products/${toner.id}`, { active: false });
      expect((await shop.post('/products/combo-quote', { parts })).body).toMatchObject({
        canMake: 0,
        limitedBy: null,
        issues: [{ position: 1, productName: 'Toner', reason: 'part_off_sale' }],
      });
    });

    it('is for whoever may edit products, reads no other shop, and refuses no parts', async () => {
      const shop = await openShop(port, texts, 'cmb');
      const toner = await product(shop, 'Toner', 400, 4);
      const parts = [{ quantity: 1, variantIds: [toner.variantId] }];
      const taker = await staffWith(port, texts, admin, shop, ['orders:manage']);
      expect((await postJson(port, '/products/combo-quote', { parts }, taker)).status).toBe(403);
      expect((await shop.post('/products/combo-quote', { parts: [] })).status).toBe(400);
      const other = await openShop(port, texts, 'cmb');
      expect((await other.post('/products/combo-quote', { parts })).body).toEqual({
        partsValue: '0.00',
        saving: null,
        canMake: null,
        limitedBy: null,
        issues: [],
        weightKg: null,
        parts: [],
      });
    });
  },
);
