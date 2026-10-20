import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import type { LowStockNotifier } from '../src/modules/inventory/ports/stock-store';
import { LOW_STOCK_NOTIFIER } from '../src/modules/inventory/tokens';
import type { LowStockNotice } from '../src/modules/inventory/types/inventory';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, postJson, putJson } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 2a: the stock ledger over HTTP and at the data layer -- opening stock, stock edits with one-tap
// reasons, history, the public stock state and its catalogue version, once-per-crossing low-stock notices, the
// made-to-order switch, cost and who may see it. INV-01 to INV-11, INV-19 to INV-21, UOM-03, CCH-08. Slice 2b: stock
// checks and the inventory figures, INV-07 and INV-18. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_inventory_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STAFF_PASSWORD = 'staff-pass-2468';

/** Keeps every low-stock notice, in place of the console stand-in. */
class LowStockCapture implements LowStockNotifier {
  readonly notices: LowStockNotice[] = [];

  lowStock(notice: LowStockNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }

  for(variantId: string): LowStockNotice[] {
    return this.notices.filter((notice) => notice.variantId === variantId);
  }
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appDbUrl: string;
const texts = new SmsCapture();
const lowStock = new LowStockCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  appDbUrl = urls.appDbUrl;
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'inventory-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(LOW_STOCK_NOTIFIER)
    .useValue(lowStock)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface VariantStock {
  variantId: string;
  optionIds: string[];
  retired: boolean;
  onHand: string;
  available: string;
  state: string;
  avgCost?: string | null;
}

interface Stock {
  productId: string;
  stockTracking: string;
  state: string;
  variants: VariantStock[];
}

interface Movement {
  delta: string;
  onHandAfter: string;
  reason: string;
  unitCost?: string | null;
  note: string | null;
  actor: { userId: string; name: string | null } | null;
}

interface Product {
  id: string;
  stockState: string;
  variants: { id: string; optionIds: string[] }[];
}

async function platformId(shop: ShopClient, name: string): Promise<string> {
  const rows = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const found = rows.find((row) => row.name === name && row.scope === 'platform');
  if (!found) throw new Error(`no platform attribute ${name}`);
  return found.id;
}

async function sizes(shop: ShopClient, values: string[]): Promise<{ size: string; ids: string[] }> {
  const size = await platformId(shop, 'Size');
  const made = await shop.post(`/attributes/${size}/options/batch`, { values });
  return { size, ids: (made.body as { id: string }[]).map((option) => option.id) };
}

async function create(shop: ShopClient, body: unknown): Promise<Product> {
  const result = await shop.post('/products', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Product;
}

/** A product with one default variant and this much opening stock. */
async function simple(
  shop: ShopClient,
  name: string,
  openingStock: number,
  extra: Record<string, unknown> = {},
): Promise<{ product: Product; variantId: string }> {
  const product = await create(shop, {
    name,
    basePrice: 100,
    variants: [{ optionIds: [], openingStock }],
    ...extra,
  });
  return { product, variantId: product.variants[0]?.id ?? '' };
}

async function stockOf(shop: ShopClient, productId: string): Promise<Stock> {
  const result = await shop.get(`/products/${productId}/stock`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Stock;
}

function variant(stock: Stock, variantId: string): VariantStock {
  const found = stock.variants.find((row) => row.variantId === variantId);
  if (!found) throw new Error(`no variant ${variantId}`);
  return found;
}

function setStock(shop: ShopClient, productId: string, variantId: string, body: unknown) {
  return shop.put(`/products/${productId}/variants/${variantId}/stock`, body);
}

async function history(
  shop: ShopClient,
  productId: string,
  variantId: string,
  query = '',
): Promise<Movement[]> {
  const result = await shop.get(
    `/products/${productId}/variants/${variantId}/stock-history${query}`,
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return (result.body as { movements: Movement[] }).movements;
}

async function version(tenantId: string): Promise<number> {
  const result = await admin.query<{ version: string }>(
    'SELECT version FROM tenant.catalogue_state WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(result.rows[0]?.version ?? 0);
}

/** A staff member of the shop holding only these permissions, signed in; the headers to call as them. */
async function staffWith(shop: ShopClient, permissions: string[]): Promise<Record<string, string>> {
  await admin.query(
    "UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter') WHERE id = $1",
    [shop.tenantId],
  );
  const role = (await shop.post('/roles', { name: permissions.join(' '), permissions })).body as {
    id: string;
  };
  const phone = texts.freshPhone();
  const made = await shop.post('/staff', { phone, password: STAFF_PASSWORD, roleIds: [role.id] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const signedIn = await postJson(
    port,
    '/auth/staff/signin',
    { phone, password: STAFF_PASSWORD },
    { host: 'localhost', 'x-lytro-shop': shop.slug },
  );
  return {
    cookie: cookieFrom(signedIn),
    'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
    host: 'localhost',
    'x-lytro-shop': shop.slug,
  };
}

describeIfDatabase('opening stock and the stock view (INV-01, INV-03, UOM-03)', () => {
  it("records a new product's stock on the shelf as its opening stock, per variant", async () => {
    const shop = await openShop(port, texts, 'opening');
    const { size, ids } = await sizes(shop, ['S', 'M']);
    const [small, medium] = ids;
    const shirt = await create(shop, {
      name: 'Shirt',
      basePrice: 450,
      lowStockThreshold: 5,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: [
        { optionIds: [small], openingStock: 10 },
        { optionIds: [medium], openingStock: 3 },
      ],
    });
    const smallId = shirt.variants.find((row) => row.optionIds[0] === small)?.id ?? '';
    const mediumId = shirt.variants.find((row) => row.optionIds[0] === medium)?.id ?? '';

    const stock = await stockOf(shop, shirt.id);
    expect(stock).toMatchObject({ stockTracking: 'tracked', state: 'in' });
    expect(variant(stock, smallId)).toMatchObject({
      optionIds: [small],
      onHand: '10.000',
      available: '10.000',
      state: 'in',
      retired: false,
    });
    expect(variant(stock, mediumId)).toMatchObject({ onHand: '3.000', state: 'low' });
    expect(((await shop.get(`/products/${shirt.id}`)).body as Product).stockState).toBe('in');

    expect(await history(shop, shirt.id, smallId)).toMatchObject([
      { delta: '10.000', onHandAfter: '10.000', reason: 'initial', actor: { name: 'Owner' } },
    ]);
    // Opening at 3 is at or under the threshold of 5: one notice, for that variant only.
    expect(lowStock.for(mediumId)).toHaveLength(1);
    expect(lowStock.for(smallId)).toHaveLength(0);
  });

  it('refuses opening stock for a made-to-order product and a fraction of a piece, and takes one of a kilo', async () => {
    const shop = await openShop(port, texts, 'opening-bad');
    const madeToOrder = await shop.post('/products', {
      name: 'Cake',
      basePrice: 900,
      stockTracking: 'not_tracked',
      variants: [{ optionIds: [], openingStock: 5 }],
    });
    expect(fieldsOf(madeToOrder)).toEqual({ 'variants.0.openingStock': 'not_allowed' });
    const fraction = await shop.post('/products', {
      name: 'Book',
      basePrice: 300,
      variants: [{ optionIds: [], openingStock: 2.5 }],
    });
    expect(fieldsOf(fraction)).toEqual({ 'variants.0.openingStock': 'not_allowed' });
    const { product, variantId } = await simple(shop, 'Cumin', 2.5, { stockUnit: 'kg' });
    expect(variant(await stockOf(shop, product.id), variantId).onHand).toBe('2.500');
  });
});

describeIfDatabase('typing a new stock number (INV-06, INV-09, INV-21)', () => {
  it('records the difference with its one-tap reason, in the history and the activity log', async () => {
    const shop = await openShop(port, texts, 'edit');
    const { product, variantId } = await simple(shop, 'Mug', 10);

    const damaged = await setStock(shop, product.id, variantId, {
      onHand: 7,
      reason: 'damaged_or_lost',
    });
    expect(damaged.status, JSON.stringify(damaged.body)).toBe(200);
    expect(variant(damaged.body as Stock, variantId).onHand).toBe('7.000');
    await setStock(shop, product.id, variantId, { onHand: 12 });
    await setStock(shop, product.id, variantId, { onHand: 12 }); // no change, no movement
    await setStock(shop, product.id, variantId, { onHand: 11, reason: 'counted_again' });
    await setStock(shop, product.id, variantId, {
      onHand: 20,
      reason: 'new_stock',
      note: 'From Rahim',
    });

    const movements = await history(shop, product.id, variantId);
    expect(movements.map((row) => [row.delta, row.reason, row.onHandAfter])).toEqual([
      ['9.000', 'manual_adjustment', '20.000'],
      ['-1.000', 'recount', '11.000'],
      ['5.000', 'manual_adjustment', '12.000'],
      ['-3.000', 'damaged', '7.000'],
      ['10.000', 'initial', '10.000'],
    ]);
    expect(movements[0]?.note).toBe('From Rahim');
    const firstPage = await shop.get(
      `/products/${product.id}/variants/${variantId}/stock-history?limit=2`,
    );
    expect(firstPage.body).toMatchObject({ total: 5, pages: 3, page: 1, limit: 2 });

    const logged = await admin.query<{ summary: Record<string, unknown> }>(
      `SELECT summary FROM tenant.activity_log
       WHERE tenant_id = $1 AND action = 'stock_adjusted' ORDER BY created_at`,
      [shop.tenantId],
    );
    expect(logged.rows).toHaveLength(4);
    expect(logged.rows[0]?.summary).toMatchObject({
      variantId,
      from: '10.000',
      to: '7.000',
      reason: 'damaged',
    });
  });

  it('refuses a reason that contradicts the change, and a fraction of a piece', async () => {
    const shop = await openShop(port, texts, 'edit-bad');
    const { product, variantId } = await simple(shop, 'Plate', 10);
    expect(
      fieldsOf(await setStock(shop, product.id, variantId, { onHand: 8, reason: 'new_stock' })),
    ).toEqual({ reason: 'not_allowed' });
    expect(
      fieldsOf(
        await setStock(shop, product.id, variantId, { onHand: 12, reason: 'damaged_or_lost' }),
      ),
    ).toEqual({ reason: 'not_allowed' });
    expect(fieldsOf(await setStock(shop, product.id, variantId, { onHand: 1.5 }))).toEqual({
      onHand: 'not_allowed',
    });
    expect(errorOf(await setStock(shop, product.id, variantId, { onHand: -1 })).code).toBe(
      'validation_error',
    );
    expect(variant(await stockOf(shop, product.id), variantId).onHand).toBe('10.000');
  });
});

describeIfDatabase('the public stock state and low-stock notices (CCH-08, INV-08, INV-19)', () => {
  it("moves the catalogue version only when the product's state changes", async () => {
    const shop = await openShop(port, texts, 'state');
    const { product, variantId } = await simple(shop, 'Pen', 50, { lowStockThreshold: 5 });
    const start = await version(shop.tenantId);
    await setStock(shop, product.id, variantId, { onHand: 49 });
    expect(await version(shop.tenantId)).toBe(start);
    await setStock(shop, product.id, variantId, { onHand: 5 });
    expect((await stockOf(shop, product.id)).state).toBe('low');
    expect(await version(shop.tenantId)).toBe(start + 1);
    await setStock(shop, product.id, variantId, { onHand: 0 });
    expect(((await shop.get(`/products/${product.id}`)).body as Product).stockState).toBe('out');
    expect(await version(shop.tenantId)).toBe(start + 2);
  });

  it('notifies once per crossing of the threshold', async () => {
    const shop = await openShop(port, texts, 'notify');
    const { product, variantId } = await simple(shop, 'Soap', 6, { lowStockThreshold: 5 });
    expect(lowStock.for(variantId)).toHaveLength(0);
    await setStock(shop, product.id, variantId, { onHand: 5 });
    expect(lowStock.for(variantId)).toHaveLength(1);
    await setStock(shop, product.id, variantId, { onHand: 4 });
    await setStock(shop, product.id, variantId, { onHand: 3 });
    expect(lowStock.for(variantId)).toHaveLength(1);
    await setStock(shop, product.id, variantId, { onHand: 10 });
    await setStock(shop, product.id, variantId, { onHand: 5 });
    expect(lowStock.for(variantId)).toHaveLength(2);
    expect(lowStock.for(variantId)[1]).toMatchObject({
      tenantId: shop.tenantId,
      productId: product.id,
      productName: 'Soap',
      available: '5.000',
    });
  });

  it("takes its best variant's state, and keeps a retired variant's stock in view", async () => {
    const shop = await openShop(port, texts, 'best');
    const { size, ids } = await sizes(shop, ['S', 'M']);
    const [small, medium] = ids;
    const shirt = await create(shop, {
      name: 'Kurti',
      basePrice: 900,
      lowStockThreshold: 2,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: [{ optionIds: [small], openingStock: 8 }, { optionIds: [medium] }],
    });
    const smallId = shirt.variants.find((row) => row.optionIds[0] === small)?.id ?? '';
    expect((await stockOf(shop, shirt.id)).state).toBe('in');

    // Retiring S, the one in stock, leaves the product out; S's 8 stay in view, never sold.
    await shop.put(`/products/${shirt.id}/variants`, {
      variantAttributes: [{ attributeId: size, optionIds: [medium] }],
    });
    const retired = await stockOf(shop, shirt.id);
    expect(retired.state).toBe('out');
    expect(variant(retired, smallId)).toMatchObject({ retired: true, onHand: '8.000' });

    // Offering S again brings its stock back with it.
    await shop.put(`/products/${shirt.id}/variants`, {
      variantAttributes: [{ attributeId: size, optionIds: ids }],
    });
    const back = await stockOf(shop, shirt.id);
    expect(back.state).toBe('in');
    expect(variant(back, smallId)).toMatchObject({ retired: false, onHand: '8.000' });
  });
});

describeIfDatabase('the made-to-order switch (INV-02)', () => {
  it('writes the stock off when a product becomes made to order, and starts at zero when tracked again', async () => {
    const shop = await openShop(port, texts, 'untrack');
    const { product, variantId } = await simple(shop, 'Cake', 12);
    const switched = await shop.patch(`/products/${product.id}`, { stockTracking: 'not_tracked' });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    const untracked = await stockOf(shop, product.id);
    expect(untracked).toMatchObject({ stockTracking: 'not_tracked', state: 'in' });
    expect(variant(untracked, variantId).onHand).toBe('0.000');
    expect((await history(shop, product.id, variantId))[0]).toMatchObject({
      delta: '-12.000',
      reason: 'manual_adjustment',
      note: 'Switched to made to order',
    });
    expect((await setStock(shop, product.id, variantId, { onHand: 3 })).status).toBe(409);

    await shop.patch(`/products/${product.id}`, { stockTracking: 'tracked' });
    const tracked = await stockOf(shop, product.id);
    expect(tracked.state).toBe('out');
    expect(variant(tracked, variantId).onHand).toBe('0.000');
  });

  it('refuses counting a product in whole units while it holds a fraction', async () => {
    const shop = await openShop(port, texts, 'unit');
    const { product } = await simple(shop, 'Rice', 2.5, { stockUnit: 'kg' });
    const refused = await shop.patch(`/products/${product.id}`, { stockUnit: 'piece' });
    expect(fieldsOf(refused)).toEqual({ stockUnit: 'not_allowed' });
  });
});

describeIfDatabase('cost and who sees it (INV-10, INV-11, INV-20, D3-9)', () => {
  it('keeps a typed cost, stamps it on stock leaving, and shows it only with inventory:manage', async () => {
    const shop = await openShop(port, texts, 'cost');
    const { product, variantId } = await simple(shop, 'Lamp', 10);
    const costed = await shop.put(`/products/${product.id}/variants/${variantId}/cost`, {
      avgCost: 120.5,
    });
    expect(costed.status, JSON.stringify(costed.body)).toBe(200);
    expect(variant(costed.body as Stock, variantId).avgCost).toBe('120.5000');
    await setStock(shop, product.id, variantId, { onHand: 7, reason: 'damaged_or_lost' });
    const movements = await history(shop, product.id, variantId);
    expect(movements[0]).toMatchObject({ reason: 'damaged', unitCost: '120.5000' });
    expect(movements[1]).toMatchObject({ reason: 'initial', unitCost: null });

    const reader = await staffWith(shop, ['inventory:read']);
    const seen = await getJson(port, `/products/${product.id}/stock`, reader);
    expect(seen.status).toBe(200);
    expect(variant(seen.body as Stock, variantId)).not.toHaveProperty('avgCost');
    const readerHistory = await getJson(
      port,
      `/products/${product.id}/variants/${variantId}/stock-history`,
      reader,
    );
    expect((readerHistory.body as { movements: Movement[] }).movements[0]).not.toHaveProperty(
      'unitCost',
    );
    expect(
      (
        await putJson(
          port,
          `/products/${product.id}/variants/${variantId}/stock`,
          { onHand: 1 },
          reader,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await putJson(
          port,
          `/products/${product.id}/variants/${variantId}/cost`,
          { avgCost: 1 },
          reader,
        )
      ).status,
    ).toBe(403);
  });

  it('refuses a staff member without inventory:read', async () => {
    const shop = await openShop(port, texts, 'cost-none');
    const { product } = await simple(shop, 'Fan', 3);
    const catalogueOnly = await staffWith(shop, ['products:read']);
    expect((await getJson(port, `/products/${product.id}/stock`, catalogueOnly)).status).toBe(403);
  });
});

describeIfDatabase("another shop's stock", () => {
  it("answers 404 for another shop's product and variant, and for a variant of another product", async () => {
    const shop = await openShop(port, texts, 'stock-own');
    const other = await openShop(port, texts, 'stock-other');
    const { product, variantId } = await simple(shop, 'Cup', 5);
    const { product: second } = await simple(shop, 'Bowl', 5);
    expect((await other.get(`/products/${product.id}/stock`)).status).toBe(404);
    expect((await setStock(other, product.id, variantId, { onHand: 1 })).status).toBe(404);
    expect(
      (await other.get(`/products/${product.id}/variants/${variantId}/stock-history`)).status,
    ).toBe(404);
    expect((await setStock(shop, second.id, variantId, { onHand: 1 })).status).toBe(404);
    expect(variant(await stockOf(shop, product.id), variantId).onHand).toBe('5.000');
  });
});

describeIfDatabase('the ledger at the data layer (INV-01, INV-03, INV-05, UOM-03)', () => {
  async function onHandAndSum(
    tenantId: string,
    variantId: string,
  ): Promise<{ onHand: string; sum: string }> {
    const result = await admin.query<{ on_hand: string; sum: string }>(
      `SELECT l.on_hand, (SELECT coalesce(sum(m.quantity_delta), 0)::numeric(14, 3)
         FROM tenant.stock_movements m WHERE m.tenant_id = l.tenant_id AND m.variant_id = l.variant_id) AS sum
       FROM tenant.stock_levels l WHERE l.tenant_id = $1 AND l.variant_id = $2`,
      [tenantId, variantId],
    );
    return { onHand: result.rows[0]?.on_hand ?? '', sum: result.rows[0]?.sum ?? '' };
  }

  it('gives exactly 50 successes for 100 simultaneous -1 changes against 50 on hand', async () => {
    const shop = await openShop(port, texts, 'race');
    const { product, variantId } = await simple(shop, 'Ticket', 50);
    const pool = new pg.Pool({ connectionString: appDbUrl, max: 20 });
    try {
      const attempts = await Promise.all(
        Array.from({ length: 100 }, async () => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query("SELECT set_config('app.tenant_id', $1, true)", [shop.tenantId]);
            await client.query(
              `INSERT INTO tenant.stock_movements (tenant_id, product_id, variant_id, quantity_delta, reason)
               VALUES ($1, $2, $3, -1, 'sale')`,
              [shop.tenantId, product.id, variantId],
            );
            await client.query('COMMIT');
            return true;
          } catch {
            await client.query('ROLLBACK');
            return false;
          } finally {
            client.release();
          }
        }),
      );
      expect(attempts.filter(Boolean)).toHaveLength(50);
    } finally {
      await pool.end();
    }
    expect(await onHandAndSum(shop.tenantId, variantId)).toEqual({ onHand: '0.000', sum: '0.000' });
  });

  it('keeps on hand equal to the sum of its movements after every step', async () => {
    const shop = await openShop(port, texts, 'invariant');
    const { product, variantId } = await simple(shop, 'Bag', 20);
    const steps: { onHand: number; reason?: string }[] = [
      { onHand: 15, reason: 'damaged_or_lost' },
      { onHand: 30, reason: 'new_stock' },
      { onHand: 29, reason: 'counted_again' },
      { onHand: 0 },
      { onHand: 7 },
    ];
    for (const step of steps) {
      await setStock(shop, product.id, variantId, step);
      const { onHand, sum } = await onHandAndSum(shop.tenantId, variantId);
      expect(onHand).toBe(step.onHand.toFixed(3));
      expect(sum).toBe(onHand);
    }
  });

  it('refuses changing or deleting a movement for every role, and a level changed directly', async () => {
    const shop = await openShop(port, texts, 'append');
    const { variantId } = await simple(shop, 'Hat', 4);
    const appClient = new pg.Client({ connectionString: appDbUrl });
    await appClient.connect();
    try {
      const asShop = async (sql: string, params: unknown[] = []) => {
        await appClient.query('BEGIN');
        try {
          await appClient.query("SELECT set_config('app.tenant_id', $1, true)", [shop.tenantId]);
          return await appClient.query(sql, params);
        } finally {
          await appClient.query('ROLLBACK');
        }
      };
      // The application role holds no UPDATE grant at all, and the trigger stands behind it.
      await expect(
        asShop('UPDATE tenant.stock_movements SET note = $2 WHERE variant_id = $1', [
          variantId,
          'x',
        ]),
      ).rejects.toThrow(/permission denied|append-only/);
      await expect(
        asShop('DELETE FROM tenant.stock_movements WHERE variant_id = $1', [variantId]),
      ).rejects.toThrow(/append-only/);
      // Naming the shop for erasure is not enough while it is live.
      await expect(
        (async () => {
          await appClient.query('BEGIN');
          try {
            await appClient.query("SELECT set_config('app.tenant_id', $1, true)", [shop.tenantId]);
            await appClient.query("SELECT set_config('app.erasing_tenant', $1, true)", [
              shop.tenantId,
            ]);
            await appClient.query('DELETE FROM tenant.stock_movements WHERE variant_id = $1', [
              variantId,
            ]);
          } finally {
            await appClient.query('ROLLBACK');
          }
        })(),
      ).rejects.toThrow(/append-only/);
      await expect(
        asShop('UPDATE tenant.stock_levels SET on_hand = 99 WHERE variant_id = $1', [variantId]),
      ).rejects.toThrow(/only through a stock movement/);
    } finally {
      await appClient.end();
    }
    // The schema owner too.
    await expect(
      admin.query('UPDATE tenant.stock_movements SET note = $2 WHERE variant_id = $1', [
        variantId,
        'x',
      ]),
    ).rejects.toThrow(/append-only/);
    await expect(
      admin.query('DELETE FROM tenant.stock_movements WHERE variant_id = $1', [variantId]),
    ).rejects.toThrow(/append-only/);
  });

  it('refuses a fraction of a piece even written directly', async () => {
    const shop = await openShop(port, texts, 'whole');
    const { product, variantId } = await simple(shop, 'Chair', 4);
    await expect(
      admin.query(
        `INSERT INTO tenant.stock_movements (tenant_id, product_id, variant_id, quantity_delta, reason)
         VALUES ($1, $2, $3, 0.5, 'manual_adjustment')`,
        [shop.tenantId, product.id, variantId],
      ),
    ).rejects.toThrow(/whole units/);
  });
});

interface CheckLine {
  variantId: string;
  productName: string | null;
  optionIds: string[];
  expected: string;
  counted: string;
  difference: string;
  unitCost?: string | null;
  value?: string | null;
}

interface CheckTotals {
  lines: number;
  changed: number;
  valueGained?: string;
  valueLost?: string;
  unknownCost?: number;
}

interface Check {
  id: string;
  note: string | null;
  actor: { userId: string; name: string | null } | null;
  totals: CheckTotals;
  lines: CheckLine[];
}

function line(check: Check, variantId: string): CheckLine {
  const found = check.lines.find((row) => row.variantId === variantId);
  if (!found) throw new Error(`no counted line for ${variantId}`);
  return found;
}

describeIfDatabase('stock checks (INV-07, INV-20, INV-21)', () => {
  it('records each difference as one recount movement and reports the value gained or lost at average cost', async () => {
    const shop = await openShop(port, texts, 'check');
    const soap = await simple(shop, 'Soap', 17);
    await shop.put(`/products/${soap.product.id}/variants/${soap.variantId}/cost`, { avgCost: 50 });
    const { size, ids } = await sizes(shop, ['S', 'M']);
    const shirt = await create(shop, {
      name: 'Shirt',
      basePrice: 300,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: [
        { optionIds: [ids[0]], openingStock: 5 },
        { optionIds: [ids[1]], openingStock: 3 },
      ],
    });
    const small = shirt.variants.find((row) => row.optionIds[0] === ids[0])?.id ?? '';
    const medium = shirt.variants.find((row) => row.optionIds[0] === ids[1])?.id ?? '';
    await shop.put(`/products/${shirt.id}/variants/${small}/cost`, { avgCost: 150 });
    const rice = await simple(shop, 'Rice', 2.5, { stockUnit: 'kg' });
    await shop.put(`/products/${rice.product.id}/variants/${rice.variantId}/cost`, { avgCost: 80 });

    const recorded = await shop.post('/stock-checks', {
      lines: [
        { variantId: soap.variantId, counted: 16 },
        { variantId: small, counted: 5 },
        { variantId: medium, counted: 4 },
        { variantId: rice.variantId, counted: 2.25 },
      ],
      note: 'Month-end count',
    });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    const check = recorded.body as Check;
    expect(check.note).toBe('Month-end count');
    expect(check.actor?.userId).toBeTruthy();
    // Soap 17 -> 16 at 50 is 50.00 lost; rice 2.5 -> 2.25 kg at 80 is 20.00 lost; the matching count changes nothing;
    // medium +1 has no cost yet, so it is counted, not valued.
    expect(check.totals).toEqual({
      lines: 4,
      changed: 3,
      valueGained: '0.00',
      valueLost: '70.00',
      unknownCost: 1,
    });
    expect(line(check, soap.variantId)).toMatchObject({
      productName: 'Soap',
      expected: '17.000',
      counted: '16.000',
      difference: '-1.000',
      unitCost: '50.0000',
      value: '-50.00',
    });
    expect(line(check, small)).toMatchObject({ difference: '0.000', value: '0.00' });
    expect(line(check, medium)).toMatchObject({
      optionIds: [ids[1]],
      difference: '1.000',
      unitCost: null,
      value: null,
    });
    expect(line(check, rice.variantId)).toMatchObject({ difference: '-0.250', value: '-20.00' });

    // The stock moved, each difference as one recount movement naming the check; the matching count wrote nothing.
    expect(variant(await stockOf(shop, soap.product.id), soap.variantId).onHand).toBe('16.000');
    const soapHistory = await history(shop, soap.product.id, soap.variantId);
    expect(soapHistory[0]).toMatchObject({
      delta: '-1.000',
      reason: 'recount',
      unitCost: '50.0000',
    });
    expect((soapHistory[0] as Movement & { reference: unknown }).reference).toEqual({
      type: 'stock_check',
      id: check.id,
    });
    expect(await history(shop, shirt.id, small)).toHaveLength(1);
    expect((await history(shop, shirt.id, medium))[0]).toMatchObject({
      delta: '1.000',
      reason: 'recount',
    });

    // INV-21: in the activity log with who made it.
    const logged = await admin.query<{ target_id: string; summary: unknown }>(
      `SELECT target_id, summary FROM tenant.activity_log
       WHERE tenant_id = $1 AND action = 'stock_checked'`,
      [shop.tenantId],
    );
    expect(logged.rows).toEqual([{ target_id: check.id, summary: { lines: 4, changed: 3 } }]);

    // The list and the check itself read back the same totals.
    const listed = await shop.get('/stock-checks');
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const page = listed.body as { checks: { id: string; totals: CheckTotals }[]; total: number };
    expect(page.total).toBe(1);
    expect(page.checks[0]).toMatchObject({ id: check.id, totals: check.totals });
    const read = await shop.get(`/stock-checks/${check.id}`);
    expect(read.status).toBe(200);
    expect((read.body as Check).lines).toEqual(check.lines);
  });

  it('values a gain at average cost too, rounded half up to the paisa', async () => {
    const shop = await openShop(port, texts, 'check-gain');
    const { product, variantId } = await simple(shop, 'Lentils', 1, { stockUnit: 'kg' });
    await shop.put(`/products/${product.id}/variants/${variantId}/cost`, { avgCost: 12.35 });
    const check = (await shop.post('/stock-checks', { lines: [{ variantId, counted: 1.3 }] }))
      .body as Check;
    // 0.3 kg x 12.35 = 3.705: 3.71 rounded half up, where rounding to even would give 3.70.
    expect(check.totals).toMatchObject({ valueGained: '3.71', valueLost: '0.00', unknownCost: 0 });
    expect(line(check, variantId)).toMatchObject({ difference: '0.300', value: '3.71' });
    const listed = (await shop.get('/stock-checks')).body as { checks: { totals: CheckTotals }[] };
    expect(listed.checks[0]?.totals.valueGained).toBe('3.71');
  });

  it("refuses a made-to-order product, a fraction of a piece, a variant listed twice and another shop's variant, recording nothing", async () => {
    const shop = await openShop(port, texts, 'check-refused');
    const other = await openShop(port, texts, 'check-other');
    const cake = await simple(shop, 'Cake', 0, { stockTracking: 'not_tracked' });
    const book = await simple(shop, 'Book', 4);
    const theirs = await simple(other, 'Theirs', 4);

    const madeToOrder = await shop.post('/stock-checks', {
      lines: [{ variantId: cake.variantId, counted: 1 }],
    });
    expect(madeToOrder.status).toBe(400);
    expect(fieldsOf(madeToOrder)).toEqual({ 'lines.0.variantId': 'not_allowed' });
    const fraction = await shop.post('/stock-checks', {
      lines: [{ variantId: book.variantId, counted: 2.5 }],
    });
    expect(fieldsOf(fraction)).toEqual({ 'lines.0.counted': 'not_allowed' });
    const twice = await shop.post('/stock-checks', {
      lines: [
        { variantId: book.variantId, counted: 3 },
        { variantId: book.variantId, counted: 2 },
      ],
    });
    expect(fieldsOf(twice)).toEqual({ 'lines.1.variantId': 'not_allowed' });
    const foreign = await shop.post('/stock-checks', {
      lines: [
        { variantId: book.variantId, counted: 3 },
        { variantId: theirs.variantId, counted: 0 },
      ],
    });
    expect(fieldsOf(foreign)).toEqual({ 'lines.1.variantId': 'not_found' });

    expect(((await shop.get('/stock-checks')).body as { total: number }).total).toBe(0);
    expect(variant(await stockOf(shop, book.product.id), book.variantId).onHand).toBe('4.000');
    expect(variant(await stockOf(other, theirs.product.id), theirs.variantId).onHand).toBe('4.000');
  });

  it('shows cost and value only with inventory:manage, and lets a reader read but not record', async () => {
    const shop = await openShop(port, texts, 'check-reader');
    const { product, variantId } = await simple(shop, 'Mug', 6);
    await shop.put(`/products/${product.id}/variants/${variantId}/cost`, { avgCost: 40 });
    const check = (await shop.post('/stock-checks', { lines: [{ variantId, counted: 5 }] }))
      .body as Check;

    const reader = await staffWith(shop, ['inventory:read']);
    const listed = await getJson(port, '/stock-checks', reader);
    expect(listed.status).toBe(200);
    expect((listed.body as { checks: { totals: CheckTotals }[] }).checks[0]?.totals).toEqual({
      lines: 1,
      changed: 1,
    });
    const read = await getJson(port, `/stock-checks/${check.id}`, reader);
    expect(read.status).toBe(200);
    const readLine = (read.body as Check).lines[0];
    expect(readLine).toMatchObject({ difference: '-1.000' });
    expect(readLine).not.toHaveProperty('unitCost');
    expect(readLine).not.toHaveProperty('value');
    expect(
      (await postJson(port, '/stock-checks', { lines: [{ variantId, counted: 1 }] }, reader))
        .status,
    ).toBe(403);
    expect((await getJson(port, '/inventory/figures', reader)).status).toBe(403);
  });

  it("answers 404 for another shop's check and a malformed id", async () => {
    const shop = await openShop(port, texts, 'check-own');
    const other = await openShop(port, texts, 'check-theirs');
    const { variantId } = await simple(shop, 'Comb', 2);
    const check = (await shop.post('/stock-checks', { lines: [{ variantId, counted: 2 }] }))
      .body as Check;
    expect((await other.get(`/stock-checks/${check.id}`)).status).toBe(404);
    expect((await shop.get('/stock-checks/not-a-check')).status).toBe(404);
    expect(((await other.get('/stock-checks')).body as { total: number }).total).toBe(0);
  });
});

describeIfDatabase('inventory figures (INV-18, D3-9)', () => {
  interface Figure {
    value: string;
    movements: number;
    unknownCost: number;
  }

  interface Figures {
    dateFrom: string;
    dateTo: string;
    stockValue: { value: string; unknownCost: number };
    costOfGoodsSold: Figure;
    losses: Figure & { byReason: (Figure & { reason: string })[] };
  }

  async function figuresOf(shop: ShopClient, query = ''): Promise<Figures> {
    const result = await shop.get(`/inventory/figures${query}`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return result.body as Figures;
  }

  /** A movement written straight to the ledger, as a sale will be in Phase 4, at a given cost and time. */
  async function moved(
    shop: ShopClient,
    product: Product,
    variantId: string,
    delta: number,
    reason: string,
    unitCost: string | null,
    at?: string,
  ): Promise<void> {
    await admin.query(
      `INSERT INTO tenant.stock_movements
         (tenant_id, product_id, variant_id, quantity_delta, reason, unit_cost, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))`,
      [shop.tenantId, product.id, variantId, delta, reason, unitCost, at ?? null],
    );
  }

  it('values the stock held, and sums cost of goods sold and losses by reason from the movements', async () => {
    const shop = await openShop(port, texts, 'figures');
    const lamp = await simple(shop, 'Lamp', 10);
    await shop.put(`/products/${lamp.product.id}/variants/${lamp.variantId}/cost`, {
      avgCost: 120.5,
    });
    const jar = await simple(shop, 'Jar', 4);
    await setStock(shop, lamp.product.id, lamp.variantId, { onHand: 7, reason: 'damaged_or_lost' });
    await shop.post('/stock-checks', { lines: [{ variantId: lamp.variantId, counted: 6 }] });
    await setStock(shop, jar.product.id, jar.variantId, { onHand: 3, reason: 'damaged_or_lost' });
    await moved(shop, lamp.product, lamp.variantId, -2, 'sale', '120.5');
    // New stock coming in is not a loss, nor is a count that finds more.
    await setStock(shop, jar.product.id, jar.variantId, { onHand: 5, reason: 'new_stock' });

    const figures = await figuresOf(shop);
    // Lamp 4 x 120.50 = 482.00; the jars have no cost, so they are counted, not valued.
    expect(figures.stockValue).toEqual({ value: '482.00', unknownCost: 1 });
    expect(figures.costOfGoodsSold).toEqual({ value: '241.00', movements: 1, unknownCost: 0 });
    expect(figures.losses).toEqual({
      value: '482.00',
      movements: 3,
      unknownCost: 1,
      byReason: [
        { reason: 'damaged', value: '361.50', movements: 2, unknownCost: 1 },
        { reason: 'recount', value: '120.50', movements: 1, unknownCost: 0 },
      ],
    });

    // The figures equal the sums of the underlying movements.
    const sums = await admin.query<{ reason: string; value: string }>(
      `SELECT reason, round(sum(-quantity_delta * unit_cost), 2)::text AS value
       FROM tenant.stock_movements WHERE tenant_id = $1 AND quantity_delta < 0 AND unit_cost IS NOT NULL
       GROUP BY reason ORDER BY reason::text`,
      [shop.tenantId],
    );
    expect(sums.rows).toEqual([
      { reason: 'damaged', value: '361.50' },
      { reason: 'recount', value: '120.50' },
      { reason: 'sale', value: '241.00' },
    ]);
  });

  it('counts a movement in the Asia/Dhaka day it happened, both ends of the period included', async () => {
    const shop = await openShop(port, texts, 'figures-period');
    const { product, variantId } = await simple(shop, 'Kettle', 20);
    // 23:59:59 on 31 January in Dhaka, and midnight on 1 February.
    await moved(shop, product, variantId, -1, 'sale', '100', '2026-01-31T17:59:59Z');
    await moved(shop, product, variantId, -2, 'sale', '100', '2026-01-31T18:00:00Z');
    await moved(shop, product, variantId, -4, 'damaged', '100', '2026-01-01T00:00:00+06:00');

    const january = await figuresOf(shop, '?dateFrom=2026-01-01&dateTo=2026-01-31');
    expect(january).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    expect(january.costOfGoodsSold).toEqual({ value: '100.00', movements: 1, unknownCost: 0 });
    expect(january.losses.value).toBe('400.00');
    const february = await figuresOf(shop, '?dateFrom=2026-02-01&dateTo=2026-02-28');
    expect(february.costOfGoodsSold).toEqual({ value: '200.00', movements: 1, unknownCost: 0 });
    expect(february.losses).toEqual({ value: '0.00', movements: 0, unknownCost: 0, byReason: [] });

    // Left out, the period is this month to today.
    const now = await figuresOf(shop);
    expect(now.dateFrom.endsWith('-01')).toBe(true);
    expect(now.dateTo.slice(0, 7)).toBe(now.dateFrom.slice(0, 7));

    const backwards = await shop.get('/inventory/figures?dateFrom=2026-02-01&dateTo=2026-01-31');
    expect(fieldsOf(backwards)).toEqual({ dateTo: 'not_allowed' });
    const notADay = await shop.get('/inventory/figures?dateFrom=2026-02-30');
    expect(fieldsOf(notADay)).toEqual({ dateFrom: 'invalid_date' });
  });
});
