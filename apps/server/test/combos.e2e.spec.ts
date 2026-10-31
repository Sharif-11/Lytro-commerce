import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { CATALOGUE_CACHE_SETTINGS } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.5, agreed 2026-10-30: combo packs -- a combo made of other products' variants, a part fixed or a
// choice, holding no stock of its own and in stock by what its parts can make (CMB-01, CMB-02, CMB-08, CMB-10); on an
// order, each combo its components, held, shipped with their serials and taken back whole (CMB-03 to CMB-05); every
// sale in stock history naming its order and its combo (CMB-05); and on the storefront, what is inside and what it
// saves (CMB-06, CMB-09). Runs only when DATABASE_TEST_ADMIN_URL is set.
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
  quantity: string;
}

interface Order {
  id: string;
  orderNumber: string;
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

/** A product in sizes M and L, each with this much stock. */
async function sized(
  shop: ShopClient,
  name: string,
  price: number,
  stock: number,
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
    variants: ids.map((id) => ({ optionIds: [id], openingStock: stock })),
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

    expect((await shop.delete(`/products/${serum.id}`)).status).toBe(200);
    expect(await stockOf(shop, pack.id)).toMatchObject({
      state: 'out',
      combo: {
        canMake: 0,
        issues: [{ position: 2, productName: 'Serum', reason: 'part_unavailable' }],
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
  });
});
