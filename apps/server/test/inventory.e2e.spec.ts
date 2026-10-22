import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isValidImei, StockReason } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { CatalogueTransactions } from '../src/modules/catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../src/modules/catalogue/tokens';
import { BatchExpiryService } from '../src/modules/inventory/services/batch-expiry.service';
import { InventoryLedger } from '../src/modules/inventory/services/inventory-ledger';
import { BATCH_EXPIRY_NOTIFIER, LOW_STOCK_NOTIFIER } from '../src/modules/inventory/tokens';
import { DAY_MS, dhakaDate } from '../src/common/time';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { ExpiryCapture, LowStockCapture } from './support/inventory-notices';
import { getJson, postJson, putJson } from './support/http';
import {
  errorOf,
  fieldsOf,
  openShop,
  staffWith as signInStaffWith,
  type ShopClient,
} from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 2a: the stock ledger over HTTP and at the data layer -- opening stock, stock edits with one-tap
// reasons, history, the public stock state and its catalogue version, once-per-crossing low-stock notices, the
// made-to-order switch, cost and who may see it. INV-01 to INV-11, INV-19 to INV-21, UOM-03, CCH-08. Slice 2b: stock
// checks and the inventory figures, INV-07 and INV-18; shared stock with pack amounts, INV-24 and UOM-04. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_inventory_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appDbUrl: string;
const texts = new SmsCapture();
const lowStock = new LowStockCapture();
const expiry = new ExpiryCapture();

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
    .overrideProvider(BATCH_EXPIRY_NOTIFIER)
    .useValue(expiry)
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
function staffWith(shop: ShopClient, permissions: string[]): Promise<Record<string, string>> {
  return signInStaffWith(port, texts, admin, shop, permissions);
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
      // PUR-07: new stock arriving is a purchase received in full.
      ['9.000', 'purchase_receipt', '20.000'],
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
    // The arrival is logged as the purchase it became (purchase_received), not as a stock edit.
    expect(logged.rows).toHaveLength(3);
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
    // Lamp 4 x 120.50 = 482.00; the jars have no cost, so they are counted, not valued. Both are in no category, and
    // both count in pieces: 4 lamps and 5 jars (D3-9).
    const held = [{ unit: 'piece', quantity: '9.000' }];
    expect(figures.stockValue).toEqual({
      value: '482.00',
      unknownCost: 1,
      units: held,
      byCategory: [{ categoryId: null, name: null, value: '482.00', unknownCost: 1, units: held }],
    });
    expect(figures.costOfGoodsSold).toEqual({ value: '241.00', movements: 1, unknownCost: 0 });
    expect(figures.losses).toEqual({
      value: '482.00',
      movements: 3,
      unknownCost: 1,
      byReason: [
        {
          reason: 'damaged',
          value: '361.50',
          movements: 2,
          unknownCost: 1,
          units: [{ unit: 'piece', quantity: '4.000' }],
        },
        {
          reason: 'recount',
          value: '120.50',
          movements: 1,
          unknownCost: 0,
          units: [{ unit: 'piece', quantity: '1.000' }],
        },
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

describeIfDatabase('shared stock (INV-24, UOM-04)', () => {
  interface SharedStock {
    variantId: string;
    onHand: string;
    reserved: string;
    available: string;
    state: string;
    avgCost?: string | null;
  }

  /** A size drawing on the shared stock holds none of its own: its onHand is null. */
  interface PackStock extends Omit<VariantStock, 'onHand'> {
    packAmount: string | null;
    onHand: string | null;
  }

  interface SharedView {
    state: string;
    shared: SharedStock | null;
    variants: PackStock[];
  }

  interface Detail {
    id: string;
    sharedStock: boolean;
    minPrice: string | null;
    variants: { id: string; optionIds: string[]; packAmount: string | null }[];
  }

  const AMOUNTS = [3, 6, 10, 100];

  /** A perfume in ml, sold as 3, 6, 10 and 100 ml from one stock. */
  async function perfume(
    shop: ShopClient,
    extra: Record<string, unknown> = {},
  ): Promise<{ product: Detail; size: Map<number, string> }> {
    const { size, ids } = await sizes(
      shop,
      AMOUNTS.map((amount) => `${String(amount)} ml`),
    );
    const result = await shop.post('/products', {
      name: 'Oud',
      basePrice: 10,
      stockUnit: 'ml',
      sharedStock: true,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: AMOUNTS.map((amount, index) => ({
        optionIds: [ids[index]],
        packAmount: amount,
        price: amount * 10,
      })),
      ...extra,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const product = result.body as Detail;
    const byOption = new Map(product.variants.map((row) => [row.optionIds[0], row.id]));
    return {
      product,
      size: new Map(AMOUNTS.map((amount, index) => [amount, byOption.get(ids[index]) ?? ''])),
    };
  }

  async function sharedOf(shop: ShopClient, productId: string): Promise<SharedView> {
    return (await stockOf(shop, productId)) as unknown as SharedView;
  }

  function availableBySize(view: SharedView, size: Map<number, string>): string[] {
    return AMOUNTS.map(
      (amount) => view.variants.find((row) => row.variantId === size.get(amount))?.available ?? '',
    );
  }

  /** The one write path every future sale takes (Phase 4), named on a size as a number of its packs. */
  async function sell(shop: ShopClient, variantId: string, packs: number): Promise<void> {
    const transactions = app.get<CatalogueTransactions>(CATALOGUE_TRANSACTIONS);
    const ledger = app.get(InventoryLedger);
    await transactions.run((tx) =>
      ledger.apply(
        tx,
        shop.tenantId,
        [{ variantId, delta: String(-packs), reason: StockReason.Sale }],
        { id: null, ip: null },
      ),
    );
  }

  it('holds one stock, shows each size its whole packs, and moves pack x quantity on it (the INV-24 example)', async () => {
    const shop = await openShop(port, texts, 'perfume');
    const { product, size } = await perfume(shop, { sharedOpeningStock: 200 });
    expect(product.sharedStock).toBe(true);
    expect(product.variants.find((row) => row.id === size.get(6))?.packAmount).toBe('6.000');
    expect(product.variants.find((row) => row.id === size.get(100))?.packAmount).toBe('100.000');

    let view = await sharedOf(shop, product.id);
    expect(view.shared).toMatchObject({ onHand: '200.000', available: '200.000', state: 'in' });
    expect(availableBySize(view, size)).toEqual(['66.000', '33.000', '20.000', '2.000']);
    expect(view.variants.every((row) => row.onHand === null)).toBe(true);

    // Two 6 ml decants sold: one movement of -12 ml on the shared stock.
    await sell(shop, size.get(6) ?? '', 2);
    view = await sharedOf(shop, product.id);
    expect(view.shared?.onHand).toBe('188.000');
    expect(availableBySize(view, size)).toEqual(['62.000', '31.000', '18.000', '1.000']);
    const pool = view.shared?.variantId ?? '';
    expect((await history(shop, product.id, pool))[0]).toMatchObject({
      delta: '-12.000',
      reason: 'sale',
    });

    // "1 x 100 ml bottle" added as a pack of its size.
    const added = await shop.post(
      `/products/${product.id}/variants/${size.get(100) ?? ''}/stock-additions`,
      { quantity: 1 },
    );
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect((added.body as SharedView).shared?.onHand).toBe('288.000');
    expect((await history(shop, product.id, pool))[0]).toMatchObject({
      delta: '100.000',
      reason: 'purchase_receipt',
    });

    // Serial numbers never go with shared stock.
    const serials = await shop.patch(`/products/${product.id}`, { serialTracked: true });
    expect(fieldsOf(serials)).toEqual({ serialTracked: 'not_allowed' });
  });

  it('records opening stock given as packs of a size, and as loose stock, on the shared stock', async () => {
    const shop = await openShop(port, texts, 'perfume-open');
    const { size: sizeAttribute, ids } = await sizes(shop, ['50 ml', '100 ml']);
    const created = await shop.post('/products', {
      name: 'Musk',
      basePrice: 900,
      stockUnit: 'ml',
      sharedStock: true,
      sharedOpeningStock: 35.5,
      variantAttributes: [{ attributeId: sizeAttribute, optionIds: ids }],
      variants: [
        { optionIds: [ids[0]], packAmount: 50 },
        { optionIds: [ids[1]], packAmount: 100, openingStock: 2 },
      ],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const product = created.body as Detail;
    const view = await sharedOf(shop, product.id);
    expect(view.shared?.onHand).toBe('235.500');
    const opening = await history(shop, product.id, view.shared?.variantId ?? '');
    expect(opening.map((row) => [row.delta, row.reason]).sort()).toEqual([
      ['200.000', 'initial'],
      ['35.500', 'initial'],
    ]);
  });

  it('keeps the stock holder out of the catalogue: variants, their count, the price range and the variant limit', async () => {
    const shop = await openShop(port, texts, 'perfume-hidden');
    const { product } = await perfume(shop);
    // A price change works the range out again, with the stock holder in place. The sizes sell from 30 to 1000; the
    // product's own price (now 12) is no variant's, so the stock holder adds none.
    await shop.patch(`/products/${product.id}`, { basePrice: 12 });
    const detail = (await shop.get(`/products/${product.id}`)).body as Detail;
    expect(detail.variants).toHaveLength(4);
    expect(detail.minPrice).toBe('30.00');
    const listed = (await shop.get('/products')).body as {
      products: { id: string; variantCount: number }[];
    };
    expect(listed.products.find((row) => row.id === product.id)?.variantCount).toBe(4);

    // A hundred sizes are allowed: the stock holder is not one of them. Options are added 50 at a time.
    const size = await platformId(shop, 'Size');
    const ids: string[] = [];
    for (const start of [1, 51]) {
      const made = await shop.post(`/attributes/${size}/options/batch`, {
        values: Array.from({ length: 50 }, (_, index) => `${String(start + index)} g`),
      });
      ids.push(...(made.body as { id: string }[]).map((option) => option.id));
    }
    const hundred = await shop.post('/products', {
      name: 'Saffron',
      basePrice: 100,
      stockUnit: 'g',
      sharedStock: true,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: ids.map((id, index) => ({ optionIds: [id], packAmount: index + 1 })),
    });
    expect(hundred.status, JSON.stringify(hundred.body)).toBe(201);
    expect((hundred.body as Detail).variants).toHaveLength(100);
  });

  it('refuses what a shared stock cannot be: no sizes, a size with no pack, a fraction of a piece, and stock set on a size', async () => {
    const shop = await openShop(port, texts, 'perfume-refused');
    const noSizes = await shop.post('/products', {
      name: 'Loose',
      basePrice: 10,
      sharedStock: true,
    });
    expect(fieldsOf(noSizes)).toEqual({ variants: 'required' });
    const noPack = await shop.post('/products', {
      name: 'Loose',
      basePrice: 10,
      sharedStock: true,
      variants: [{ optionIds: [] }],
    });
    expect(fieldsOf(noPack)).toEqual({ 'variants.0.packAmount': 'required' });
    const packOnOrdinary = await shop.post('/products', {
      name: 'Plain',
      basePrice: 10,
      variants: [{ optionIds: [], packAmount: 2 }],
    });
    expect(fieldsOf(packOnOrdinary)).toEqual({ 'variants.0.packAmount': 'not_allowed' });
    const fractionOfPiece = await shop.post('/products', {
      name: 'Pens',
      basePrice: 10,
      stockUnit: 'piece',
      sharedStock: true,
      variants: [{ optionIds: [], packAmount: 1.5 }],
    });
    expect(fieldsOf(fractionOfPiece)).toEqual({ 'variants.0.packAmount': 'not_allowed' });
    const halfPack = await shop.post('/products', {
      name: 'Pens',
      basePrice: 10,
      stockUnit: 'piece',
      sharedStock: true,
      variants: [{ optionIds: [], packAmount: 12, openingStock: 1.5 }],
    });
    expect(fieldsOf(halfPack)).toEqual({ 'variants.0.openingStock': 'not_whole_number' });
    const withSerials = await shop.post('/products', {
      name: 'Phones',
      basePrice: 10,
      serialTracked: true,
      sharedStock: true,
      variants: [{ optionIds: [], packAmount: 1 }],
    });
    expect(fieldsOf(withSerials)).toEqual({ serialTracked: 'not_allowed' });
    const patched = await shop.patch(`/products/${(await simple(shop, 'Box', 1)).product.id}`, {
      sharedStock: true,
    });
    expect(fieldsOf(patched)).toEqual({ sharedStock: 'not_allowed' });

    const { product, size } = await perfume(shop, { sharedOpeningStock: 30 });
    const six = size.get(6) ?? '';
    const onSize = await setStock(shop, product.id, six, { onHand: 5 });
    expect(onSize.status).toBe(409);
    expect(errorOf(onSize).code).toBe('conflict');
    expect(
      (await shop.put(`/products/${product.id}/variants/${six}/cost`, { avgCost: 1 })).status,
    ).toBe(409);
    const counted = await shop.post('/stock-checks', { lines: [{ variantId: six, counted: 1 }] });
    expect(fieldsOf(counted)).toEqual({ 'lines.0.variantId': 'not_allowed' });
    const halfDecant = await shop.post(`/products/${product.id}/variants/${six}/stock-additions`, {
      quantity: 1.5,
    });
    expect(fieldsOf(halfDecant)).toEqual({ quantity: 'not_allowed' });
    expect((await sharedOf(shop, product.id)).shared?.onHand).toBe('30.000');
  });

  it('switches to and from shared stock only while the product holds nothing, and keeps one stock holder', async () => {
    const shop = await openShop(port, texts, 'perfume-switch');
    const { size, ids } = await sizes(shop, ['5 ml', '10 ml']);
    const product = await create(shop, {
      name: 'Amber',
      basePrice: 300,
      stockUnit: 'ml',
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: [
        { optionIds: [ids[0]], openingStock: 4 },
        { optionIds: [ids[1]], openingStock: 0 },
      ],
    });
    const small = product.variants.find((row) => row.optionIds[0] === ids[0])?.id ?? '';
    const shareIt = {
      sharedStock: true,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: [
        { optionIds: [ids[0]], packAmount: 5 },
        { optionIds: [ids[1]], packAmount: 10 },
      ],
    };

    // Four 5 ml vials are never turned into 20 ml of loose stock.
    const holding = await shop.put(`/products/${product.id}/variants`, shareIt);
    expect(holding.status).toBe(409);
    expect(errorOf(holding).code).toBe('conflict');
    await setStock(shop, product.id, small, { onHand: 0, reason: 'other' });
    const shared = await shop.put(`/products/${product.id}/variants`, shareIt);
    expect(shared.status, JSON.stringify(shared.body)).toBe(200);
    expect((shared.body as Detail).sharedStock).toBe(true);
    let view = await sharedOf(shop, product.id);
    const holder = view.shared?.variantId ?? '';
    expect(holder).not.toBe('');
    await setStock(shop, product.id, holder, { onHand: 60, reason: 'new_stock' });

    const unshareIt = {
      ...shareIt,
      sharedStock: false,
      variants: [{ optionIds: [ids[0]] }, { optionIds: [ids[1]] }],
    };
    expect((await shop.put(`/products/${product.id}/variants`, unshareIt)).status).toBe(409);
    await setStock(shop, product.id, holder, { onHand: 0, reason: 'other' });
    const unshared = await shop.put(`/products/${product.id}/variants`, unshareIt);
    expect(unshared.status, JSON.stringify(unshared.body)).toBe(200);
    expect((unshared.body as Detail).sharedStock).toBe(false);
    expect((unshared.body as Detail).variants.map((row) => row.packAmount)).toEqual([null, null]);
    view = await sharedOf(shop, product.id);
    expect(view.shared).toBeNull();
    expect(view.variants).toHaveLength(2);

    // Shared again: the same stock holder comes back, with its history.
    await shop.put(`/products/${product.id}/variants`, shareIt);
    view = await sharedOf(shop, product.id);
    expect(view.shared?.variantId).toBe(holder);
    expect(await history(shop, product.id, holder)).toHaveLength(2);
  });

  it('writes the shared stock off and stops sharing when the product becomes made to order', async () => {
    const shop = await openShop(port, texts, 'perfume-mto');
    const { product } = await perfume(shop, { sharedOpeningStock: 50 });
    const holder = (await sharedOf(shop, product.id)).shared?.variantId ?? '';
    const made = await shop.patch(`/products/${product.id}`, { stockTracking: 'not_tracked' });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const detail = made.body as Detail;
    expect(detail.sharedStock).toBe(false);
    expect(detail.variants.every((row) => row.packAmount === null)).toBe(true);
    expect((await history(shop, product.id, holder))[0]).toMatchObject({
      delta: '-50.000',
      reason: 'manual_adjustment',
      note: 'Switched to made to order',
    });
    expect((await sharedOf(shop, product.id)).shared).toBeNull();
  });

  it('states each size from the shared stock, and sends the low-stock notice on the shared stock, once per crossing', async () => {
    const shop = await openShop(port, texts, 'perfume-low');
    const { product, size } = await perfume(shop, {
      sharedOpeningStock: 120,
      lowStockThreshold: 20,
    });
    const holder = (await sharedOf(shop, product.id)).shared?.variantId ?? '';
    expect((await shop.get(`/products/${product.id}`)).body).toMatchObject({ stockState: 'in' });

    await sell(shop, size.get(100) ?? '', 1); // 20 ml left: at the threshold
    expect(lowStock.for(holder)).toHaveLength(1);
    let view = await sharedOf(shop, product.id);
    expect(view.state).toBe('low');
    expect(view.variants.find((row) => row.variantId === size.get(100))?.state).toBe('out');
    await sell(shop, size.get(10) ?? '', 1); // 10 ml left: still past it, no second notice
    expect(lowStock.for(holder)).toHaveLength(1);
    await sell(shop, size.get(3) ?? '', 3); // 1 ml: no size has a whole pack left
    view = await sharedOf(shop, product.id);
    expect(view.state).toBe('out');
    expect((await shop.get(`/products/${product.id}`)).body).toMatchObject({ stockState: 'out' });
  });

  it('prices a pack at its share of the per-unit cost, and records that cost on stock leaving', async () => {
    const shop = await openShop(port, texts, 'perfume-cost');
    const { product, size } = await perfume(shop, { sharedOpeningStock: 100 });
    const holder = (await sharedOf(shop, product.id)).shared?.variantId ?? '';
    const costed = await shop.put(`/products/${product.id}/variants/${holder}/cost`, {
      avgCost: 2.5,
    });
    expect(costed.status, JSON.stringify(costed.body)).toBe(200);
    const view = costed.body as SharedView;
    expect(view.shared?.avgCost).toBe('2.5000');
    expect(view.variants.find((row) => row.variantId === size.get(6))?.avgCost).toBe('15.0000');
    await sell(shop, size.get(6) ?? '', 1);
    expect((await history(shop, product.id, holder))[0]).toMatchObject({
      delta: '-6.000',
      unitCost: '2.5000',
    });
  });

  it('counts the shared stock in a stock check, and copies the sharing when the product is duplicated', async () => {
    const shop = await openShop(port, texts, 'perfume-copy');
    const { product } = await perfume(shop, { sharedOpeningStock: 200 });
    const holder = (await sharedOf(shop, product.id)).shared?.variantId ?? '';
    const check = await shop.post('/stock-checks', {
      lines: [{ variantId: holder, counted: 190 }],
    });
    expect(check.status, JSON.stringify(check.body)).toBe(201);
    expect((check.body as { lines: unknown[] }).lines[0]).toMatchObject({
      productName: 'Oud',
      optionIds: [],
      difference: '-10.000',
    });
    expect((await sharedOf(shop, product.id)).shared?.onHand).toBe('190.000');

    const copied = await shop.post(`/products/${product.id}/duplicate`, {});
    expect(copied.status, JSON.stringify(copied.body)).toBe(201);
    const copy = copied.body as Detail;
    expect(copy.sharedStock).toBe(true);
    const packs = (detail: Detail) =>
      detail.variants.map((row) => Number(row.packAmount)).sort((a, b) => a - b);
    expect(packs(copy)).toEqual(AMOUNTS);
    const copyStock = await sharedOf(shop, copy.id);
    expect(copyStock.shared).toMatchObject({ onHand: '0.000' });
    expect(copyStock.shared?.variantId).not.toBe(holder);
  });

  it('holds the rules at the data layer: stock only on the holder, no switch while holding, whole packs of pieces', async () => {
    const shop = await openShop(port, texts, 'perfume-db');
    const { product, size } = await perfume(shop, { sharedOpeningStock: 40 });
    await expect(
      admin.query(
        `INSERT INTO tenant.stock_movements (tenant_id, product_id, variant_id, quantity_delta, reason)
         VALUES ($1, $2, $3, 5, 'recount')`,
        [shop.tenantId, product.id, size.get(6)],
      ),
    ).rejects.toThrow(/stock holder only/);
    await expect(
      admin.query('UPDATE tenant.products SET shared_stock = false WHERE id = $1', [product.id]),
    ).rejects.toThrow(/only while it holds none/);
    const pens = await simple(shop, 'Pens', 0);
    await expect(
      admin.query('UPDATE tenant.product_variants SET pack_amount = 1.5 WHERE id = $1', [
        pens.variantId,
      ]),
    ).rejects.toThrow(/whole number/);
  });
});

describeIfDatabase('batches and expiry (INV-12, INV-13)', () => {
  interface Batch {
    id: string;
    variantId: string;
    optionIds: string[];
    batchCode: string | null;
    expiresOn: string | null;
    noExpiry: boolean;
    quantity: string;
    state: string;
  }

  interface BatchMovement extends Movement {
    batch: { id: string; batchCode: string | null; expiresOn: string | null } | null;
  }

  /** A day `offset` days from today, in Asia/Dhaka, as YYYY-MM-DD. */
  const day = (offset: number): string => dhakaDate(new Date(Date.now() + offset * DAY_MS));

  /** A batch-tracked product with one default variant. */
  async function cream(
    shop: ShopClient,
    extra: Record<string, unknown> = {},
  ): Promise<{ product: Product; variantId: string }> {
    return simple(shop, 'Face cream', 0, { batchTracked: true, ...extra });
  }

  async function batchesOf(shop: ShopClient, productId: string): Promise<Batch[]> {
    const result = await shop.get(`/products/${productId}/batches`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return (result.body as { batches: Batch[] }).batches;
  }

  function add(shop: ShopClient, productId: string, variantId: string, body: unknown) {
    return shop.post(`/products/${productId}/variants/${variantId}/stock-additions`, body);
  }

  async function sell(shop: ShopClient, variantId: string, quantity: number): Promise<void> {
    const transactions = app.get<CatalogueTransactions>(CATALOGUE_TRANSACTIONS);
    const ledger = app.get(InventoryLedger);
    await transactions.run((tx) =>
      ledger.apply(
        tx,
        shop.tenantId,
        [{ variantId, delta: String(-quantity), reason: StockReason.Sale }],
        { id: null, ip: null },
      ),
    );
  }

  /** As if the batch's last sellable day had passed. */
  async function expire(batchId: string): Promise<void> {
    await admin.query('UPDATE tenant.stock_batches SET expires_on = $2 WHERE id = $1', [
      batchId,
      day(-1),
    ]);
  }

  async function onHandAndBatches(
    tenantId: string,
    variantId: string,
  ): Promise<{ onHand: string; batches: string }> {
    const result = await admin.query<{ on_hand: string; batches: string }>(
      `SELECT l.on_hand, (SELECT coalesce(sum(b.quantity), 0)::numeric(14, 3) FROM tenant.stock_batches b
         WHERE b.tenant_id = l.tenant_id AND b.variant_id = l.variant_id AND b.closed_at IS NULL) AS batches
       FROM tenant.stock_levels l WHERE l.tenant_id = $1 AND l.variant_id = $2`,
      [tenantId, variantId],
    );
    return { onHand: result.rows[0]?.on_hand ?? '', batches: result.rows[0]?.batches ?? '' };
  }

  it('takes the earliest-expiring batch first, one movement per batch (the Slice 3 done-when)', async () => {
    const shop = await openShop(port, texts, 'batch-fefo');
    const { product, variantId } = await cream(shop);
    // Received in the opposite order to their expiry: the later batch first.
    expect(
      (
        await add(shop, product.id, variantId, {
          quantity: 4,
          batch: { batchCode: 'MAR', expiresOn: day(100) },
        })
      ).status,
    ).toBe(200);
    await add(shop, product.id, variantId, {
      quantity: 3,
      batch: { batchCode: 'JAN', expiresOn: day(40) },
    });
    await add(shop, product.id, variantId, { quantity: 6 }); // no expiry: picked last

    await sell(shop, variantId, 5);
    const moved = (await history(shop, product.id, variantId)) as BatchMovement[];
    expect(moved.slice(0, 2).map((row) => [row.delta, row.batch?.batchCode])).toEqual(
      expect.arrayContaining([
        ['-3.000', 'JAN'],
        ['-2.000', 'MAR'],
      ]),
    );
    const batches = await batchesOf(shop, product.id);
    expect(batches.map((row) => [row.batchCode, row.quantity, row.noExpiry])).toEqual([
      ['MAR', '2.000', false],
      [null, '6.000', true],
    ]);
    expect(await onHandAndBatches(shop.tenantId, variantId)).toEqual({
      onHand: '8.000',
      batches: '8.000',
    });
  });

  it('puts arriving stock in the batch described, the batch named, or the one "no expiry" batch', async () => {
    const shop = await openShop(port, texts, 'batch-in');
    const { product, variantId } = await cream(shop, {
      variants: [
        { optionIds: [], openingStock: 2, openingBatch: { batchCode: 'L1', expiresOn: day(60) } },
      ],
    });
    await add(shop, product.id, variantId, { quantity: 1 });
    await add(shop, product.id, variantId, { quantity: 2 });
    // The same lot again, with or without its expiry, joins it.
    await add(shop, product.id, variantId, { quantity: 5, batch: { batchCode: 'L1' } });
    await add(shop, product.id, variantId, {
      quantity: 1,
      batch: { batchCode: 'L1', expiresOn: day(60) },
    });
    let batches = await batchesOf(shop, product.id);
    expect(batches.map((row) => [row.batchCode, row.quantity])).toEqual([
      ['L1', '8.000'],
      [null, '3.000'],
    ]);
    const lot = batches[0]?.id ?? '';
    await add(shop, product.id, variantId, { quantity: 1, batchId: lot });
    batches = await batchesOf(shop, product.id);
    expect(batches[0]?.quantity).toBe('9.000');

    const differs = await add(shop, product.id, variantId, {
      quantity: 1,
      batch: { batchCode: 'L1', expiresOn: day(90) },
    });
    expect(differs.status).toBe(409);
    const past = await add(shop, product.id, variantId, {
      quantity: 1,
      batch: { expiresOn: day(-3) },
    });
    expect(fieldsOf(past)).toEqual({ 'batch.expiresOn': 'not_allowed' });
    const both = await add(shop, product.id, variantId, { quantity: 1, batchId: lot, batch: {} });
    expect(fieldsOf(both)).toEqual({ batch: 'not_allowed' });
    // Stock leaving names the batch it leaves, never a new one.
    const newOnTheWayOut = await setStock(shop, product.id, variantId, {
      onHand: 2,
      batch: { batchCode: 'X' },
    });
    expect(fieldsOf(newOnTheWayOut)).toEqual({ batch: 'not_allowed' });
    await setStock(shop, product.id, variantId, {
      onHand: 10,
      reason: 'damaged_or_lost',
      batchId: lot,
    });
    batches = await batchesOf(shop, product.id);
    expect(batches.map((row) => row.quantity)).toEqual(['7.000', '3.000']);

    // A product without batches takes none.
    const plain = await simple(shop, 'Plain soap', 3);
    const refused = await add(shop, plain.product.id, plain.variantId, {
      quantity: 1,
      batch: { batchCode: 'A' },
    });
    expect(fieldsOf(refused)).toEqual({ batch: 'not_allowed' });
    const opening = await shop.post('/products', {
      name: 'Plain',
      basePrice: 1,
      variants: [{ optionIds: [], openingStock: 1, openingBatch: { batchCode: 'A' } }],
    });
    expect(fieldsOf(opening)).toEqual({ 'variants.0.openingBatch': 'not_allowed' });
  });

  it('never sells an expired batch, takes it out of available, and writes it off only when confirmed', async () => {
    const shop = await openShop(port, texts, 'batch-expired');
    const { product, variantId } = await cream(shop, { lowStockThreshold: 0 });
    await shop.put(`/products/${product.id}/variants/${variantId}/cost`, { avgCost: 40 });
    await add(shop, product.id, variantId, {
      quantity: 3,
      batch: { batchCode: 'OLD', expiresOn: day(10) },
    });
    await add(shop, product.id, variantId, {
      quantity: 2,
      batch: { batchCode: 'NEW', expiresOn: day(200) },
    });
    const held = await batchesOf(shop, product.id);
    const old = held.find((row) => row.batchCode === 'OLD')?.id ?? '';
    const fresh = held.find((row) => row.batchCode === 'NEW')?.id ?? '';
    await expire(old);
    const pass = await app.get(BatchExpiryService).runDaily();
    expect(pass.refreshed).toBeGreaterThanOrEqual(1);

    let stock = variant(await stockOf(shop, product.id), variantId) as VariantStock & {
      unsellable: string;
    };
    expect(stock).toMatchObject({ onHand: '5.000', unsellable: '3.000', available: '2.000' });
    expect((await batchesOf(shop, product.id)).find((row) => row.id === old)?.state).toBe(
      'expired',
    );
    // A sale takes only what is sellable.
    await expect(sell(shop, variantId, 3)).rejects.toMatchObject({ code: 'conflict' });
    await sell(shop, variantId, 2);
    expect((await shop.get(`/products/${product.id}`)).body).toMatchObject({ stockState: 'out' });

    // A batch not yet expired is never written off this way.
    const notYet = await shop.post(`/products/${product.id}/batches/${fresh}/write-off`, {});
    expect(notYet.status).toBe(409);
    const writtenOff = await shop.post(`/products/${product.id}/batches/${old}/write-off`, {});
    expect(writtenOff.status, JSON.stringify(writtenOff.body)).toBe(200);
    stock = variant(await stockOf(shop, product.id), variantId) as VariantStock & {
      unsellable: string;
    };
    expect(stock).toMatchObject({ onHand: '0.000', unsellable: '0.000' });
    expect(((await history(shop, product.id, variantId)) as BatchMovement[])[0]).toMatchObject({
      delta: '-3.000',
      reason: 'expired',
      unitCost: '40.0000',
    });
    const figures = (await shop.get('/inventory/figures')).body as {
      losses: { byReason: { reason: string; value: string }[] };
    };
    expect(figures.losses.byReason).toContainEqual(
      expect.objectContaining({ reason: 'expired', value: '120.00' }),
    );
  });

  it('warns once per batch expiring within 30 days, and lists the expiring and the expired', async () => {
    const shop = await openShop(port, texts, 'batch-warn');
    const { product, variantId } = await cream(shop);
    await add(shop, product.id, variantId, {
      quantity: 4,
      batch: { batchCode: 'SOON', expiresOn: day(20) },
    });
    await add(shop, product.id, variantId, {
      quantity: 4,
      batch: { batchCode: 'LATER', expiresOn: day(45) },
    });
    await add(shop, product.id, variantId, {
      quantity: 1,
      batch: { batchCode: 'GONE', expiresOn: day(5) },
    });
    const batches = await batchesOf(shop, product.id);
    const soon = batches.find((row) => row.batchCode === 'SOON')?.id ?? '';
    const later = batches.find((row) => row.batchCode === 'LATER')?.id ?? '';
    const gone = batches.find((row) => row.batchCode === 'GONE')?.id ?? '';
    await expire(gone);

    const service = app.get(BatchExpiryService);
    await service.runDaily();
    expect(expiry.for(soon)).toHaveLength(1);
    expect(expiry.for(soon)[0]).toMatchObject({
      batchCode: 'SOON',
      expiresOn: day(20),
      quantity: '4.000',
    });
    expect(expiry.for(later)).toHaveLength(0);
    // A second pass sends nothing more.
    await service.runDaily();
    expect(expiry.for(soon)).toHaveLength(1);

    const expiring = (await shop.get('/batches?state=expiring')).body as { batches: Batch[] };
    expect(expiring.batches.map((row) => row.batchCode)).toEqual(['SOON']);
    const expired = (await shop.get('/batches?state=expired')).body as { batches: Batch[] };
    expect(expired.batches.map((row) => row.batchCode)).toEqual(['GONE']);
    const both = (await shop.get('/batches')).body as { batches: Batch[]; total: number };
    expect(both.batches.map((row) => row.batchCode)).toEqual(['GONE', 'SOON']);
  });

  it('turns batches on over stock held with no movement, and off only once expired stock is written off', async () => {
    const shop = await openShop(port, texts, 'batch-switch');
    const { product, variantId } = await simple(shop, 'Lotion', 10);
    const on = await shop.patch(`/products/${product.id}`, { batchTracked: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect((await batchesOf(shop, product.id)).map((row) => [row.noExpiry, row.quantity])).toEqual([
      [true, '10.000'],
    ]);
    expect(await history(shop, product.id, variantId)).toHaveLength(1); // only the opening stock
    expect(await onHandAndBatches(shop.tenantId, variantId)).toEqual({
      onHand: '10.000',
      batches: '10.000',
    });

    await add(shop, product.id, variantId, {
      quantity: 2,
      batch: { batchCode: 'B', expiresOn: day(9) },
    });
    const dated =
      (await batchesOf(shop, product.id)).find((row) => row.batchCode === 'B')?.id ?? '';
    await expire(dated);
    const off = await shop.patch(`/products/${product.id}`, { batchTracked: false });
    expect(off.status).toBe(409);
    expect(fieldsOf(off)).toEqual({ batchTracked: 'not_allowed' });
    await shop.post(`/products/${product.id}/batches/${dated}/write-off`, {});
    const offNow = await shop.patch(`/products/${product.id}`, { batchTracked: false });
    expect(offNow.status, JSON.stringify(offNow.body)).toBe(200);
    expect(await batchesOf(shop, product.id)).toEqual([]);
    expect(variant(await stockOf(shop, product.id), variantId).onHand).toBe('10.000');
    // Unbatched again: a plain edit moves it.
    expect((await setStock(shop, product.id, variantId, { onHand: 9 })).status).toBe(200);
  });

  it('counts a batch, or the variant as a whole, in a stock check', async () => {
    const shop = await openShop(port, texts, 'batch-check');
    const { product, variantId } = await cream(shop);
    await add(shop, product.id, variantId, {
      quantity: 5,
      batch: { batchCode: 'A', expiresOn: day(60) },
    });
    await add(shop, product.id, variantId, {
      quantity: 3,
      batch: { batchCode: 'B', expiresOn: day(90) },
    });
    const a = (await batchesOf(shop, product.id)).find((row) => row.batchCode === 'A')?.id ?? '';
    const byBatch = await shop.post('/stock-checks', {
      lines: [{ variantId, batchId: a, counted: 4 }],
    });
    expect(byBatch.status, JSON.stringify(byBatch.body)).toBe(201);
    expect((byBatch.body as { lines: unknown[] }).lines[0]).toMatchObject({
      expected: '5.000',
      counted: '4.000',
      batch: { id: a, batchCode: 'A' },
    });
    // The whole variant counted at 10 where it holds 7: the 3 found have no batch yet.
    await shop.post('/stock-checks', { lines: [{ variantId, counted: 10 }] });
    expect((await batchesOf(shop, product.id)).map((row) => [row.batchCode, row.quantity])).toEqual(
      [
        ['A', '4.000'],
        ['B', '3.000'],
        [null, '3.000'],
      ],
    );
    const both = await shop.post('/stock-checks', {
      lines: [
        { variantId, counted: 1 },
        { variantId, batchId: a, counted: 1 },
      ],
    });
    expect(fieldsOf(both)).toEqual({ 'lines.1.batchId': 'not_allowed' });
  });

  it('keeps a shared stock in batches on its pool', async () => {
    const shop = await openShop(port, texts, 'batch-pool');
    const { size, ids } = await sizes(shop, ['30 ml', '50 ml']);
    const created = await shop.post('/products', {
      name: 'Serum',
      basePrice: 100,
      stockUnit: 'ml',
      batchTracked: true,
      sharedStock: true,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: [
        { optionIds: [ids[0]], packAmount: 30 },
        {
          optionIds: [ids[1]],
          packAmount: 50,
          openingStock: 2,
          openingBatch: { batchCode: 'S1', expiresOn: day(120) },
        },
      ],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const product = created.body as Product;
    const batches = await batchesOf(shop, product.id);
    expect(batches.map((row) => [row.batchCode, row.quantity, row.optionIds])).toEqual([
      ['S1', '100.000', []],
    ]);
  });

  it('holds the batch rules at the data layer, and keeps another shop out', async () => {
    const shop = await openShop(port, texts, 'batch-db');
    const other = await openShop(port, texts, 'batch-other');
    const { product, variantId } = await cream(shop);
    await add(shop, product.id, variantId, {
      quantity: 4,
      batch: { batchCode: 'Z', expiresOn: day(30) },
    });
    const batch = (await batchesOf(shop, product.id))[0]?.id ?? '';
    await expect(
      admin.query(
        `INSERT INTO tenant.stock_movements (tenant_id, product_id, variant_id, quantity_delta, reason)
         VALUES ($1, $2, $3, 1, 'recount')`,
        [shop.tenantId, product.id, variantId],
      ),
    ).rejects.toThrow(/names a batch exactly when/);
    await expect(
      admin.query('UPDATE tenant.stock_batches SET quantity = 99 WHERE id = $1', [batch]),
    ).rejects.toThrow(/only through a stock movement/);
    await expect(
      admin.query(
        `INSERT INTO tenant.stock_batches (tenant_id, variant_id, quantity) VALUES ($1, $2, 5)`,
        [shop.tenantId, variantId],
      ),
    ).rejects.toThrow(/only through a stock movement/);
    await expect(
      admin.query('DELETE FROM tenant.stock_batches WHERE id = $1', [batch]),
    ).rejects.toThrow(/goes only with its variant/);

    expect((await other.get(`/products/${product.id}/batches`)).status).toBe(404);
    expect(
      (await other.post(`/products/${product.id}/batches/${batch}/write-off`, {})).status,
    ).toBe(404);
    expect(((await other.get('/batches')).body as { total: number }).total).toBe(0);
  });
});

describeIfDatabase('serial numbers (INV-14, INV-23)', () => {
  interface Serial {
    id: string;
    serial: string;
    status: string;
    receivedMovementId: number | null;
    leftMovementId: number | null;
  }

  interface SerialMovement extends Movement {
    id: number;
    serials: string[];
  }

  let next = 0;
  /** A fresh, valid IMEI: 14 digits and their check digit. */
  function imei(): string {
    next += 1;
    const body = `35${String(Date.now()).slice(-6)}${String(next).padStart(6, '0')}`;
    for (let digit = 0; digit <= 9; digit += 1) {
      if (isValidImei(`${body}${String(digit)}`)) return `${body}${String(digit)}`;
    }
    throw new Error('no check digit');
  }

  /** A phone sold by IMEI, with one default variant. */
  function phone(shop: ShopClient, name = 'Phone', extra: Record<string, unknown> = {}) {
    return simple(shop, name, 0, { serialTracked: true, serialFormat: 'imei', ...extra });
  }

  async function serialsOf(
    shop: ShopClient,
    productId: string,
    variantId: string,
    query = '',
  ): Promise<{ serials: Serial[]; total: number }> {
    const result = await shop.get(`/products/${productId}/variants/${variantId}/serials${query}`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return result.body as { serials: Serial[]; total: number };
  }

  async function missing(
    shop: ShopClient,
    productId: string,
    variantId: string,
  ): Promise<number | null> {
    return (
      variant(await stockOf(shop, productId), variantId) as VariantStock & {
        missingSerials: number | null;
      }
    ).missingSerials;
  }

  function add(shop: ShopClient, productId: string, variantId: string, body: unknown) {
    return shop.post(`/products/${productId}/variants/${variantId}/stock-additions`, body);
  }

  it('records one IMEI per unit received, or leaves them to add later, and never takes the same IMEI twice (the INV-14 pass criterion)', async () => {
    const shop = await openShop(port, texts, 'serial-receive');
    const { product, variantId } = await phone(shop);
    const [a, b, c] = [imei(), imei(), imei()];
    const received = await add(shop, product.id, variantId, { quantity: 3, serials: [a, b, c] });
    expect(received.status, JSON.stringify(received.body)).toBe(200);
    expect(
      (await serialsOf(shop, product.id, variantId)).serials.map((row) => row.serial).sort(),
    ).toEqual([a, b, c].sort());
    expect(await missing(shop, product.id, variantId)).toBe(0);
    expect(
      ((await history(shop, product.id, variantId)) as SerialMovement[])[0]?.serials.sort(),
    ).toEqual([a, b, c].sort());

    await add(shop, product.id, variantId, { quantity: 3 });
    expect(await missing(shop, product.id, variantId)).toBe(3);

    const twice = await add(shop, product.id, variantId, { quantity: 1, serials: [b] });
    expect(twice.status).toBe(409);
    expect(fieldsOf(twice)).toEqual({ 'serials.0': 'taken' });
  });

  it('flags a bad check digit, a short number and a repeat line by line, saving nothing (INV-23)', async () => {
    const shop = await openShop(port, texts, 'serial-flags');
    const { product, variantId } = await phone(shop);
    const good = imei();
    const wrong = `${good.slice(0, 14)}${String((Number(good[14]) + 1) % 10)}`;
    const refused = await add(shop, product.id, variantId, {
      quantity: 4,
      serials: [good, wrong, '12345', good],
    });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toEqual({
      'serials.1': 'invalid_format',
      'serials.2': 'invalid_format',
      'serials.3': 'not_allowed',
    });
    expect(variant(await stockOf(shop, product.id), variantId).onHand).toBe('0.000');
    // Spaces and dashes are a scan's or a person's; the IMEI is its digits.
    const spaced = `${good.slice(0, 2)} ${good.slice(2, 8)}-${good.slice(8)}`;
    await add(shop, product.id, variantId, { quantity: 1, serials: [spaced] });
    expect((await serialsOf(shop, product.id, variantId)).serials[0]?.serial).toBe(good);

    // Any other serial is compared in capitals.
    const laptop = await simple(shop, 'Laptop', 0, { serialTracked: true });
    await add(shop, laptop.product.id, laptop.variantId, { quantity: 1, serials: ['sn-abc'] });
    const again = await add(shop, laptop.product.id, laptop.variantId, {
      quantity: 1,
      serials: ['SN-ABC'],
    });
    expect(fieldsOf(again)).toEqual({ 'serials.0': 'taken' });
  });

  it('adds serials later, up to the units still missing one, and corrects or removes one while its unit is in stock', async () => {
    const shop = await openShop(port, texts, 'serial-later');
    const { product, variantId } = await phone(shop);
    await add(shop, product.id, variantId, { quantity: 3 });
    const [a, b, c] = [imei(), imei(), imei()];
    const added = await shop.post(`/products/${product.id}/variants/${variantId}/serials`, {
      serials: [a, b],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(await missing(shop, product.id, variantId)).toBe(1);
    const tooMany = await shop.post(`/products/${product.id}/variants/${variantId}/serials`, {
      serials: [c, imei()],
    });
    expect(fieldsOf(tooMany)).toEqual({ serials: 'too_many' });

    const held = (await serialsOf(shop, product.id, variantId)).serials;
    const first = held.find((row) => row.serial === a)?.id ?? '';
    const corrected = await shop.patch(`/products/${product.id}/serials/${first}`, { serial: c });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
    expect((corrected.body as Serial).serial).toBe(c);
    const second = held.find((row) => row.serial === b)?.id ?? '';
    expect((await shop.delete(`/products/${product.id}/serials/${second}`)).status).toBe(200);
    expect(await missing(shop, product.id, variantId)).toBe(2);
  });

  it('names the serials leaving, takes units without one first, and refuses when every unit has one', async () => {
    const shop = await openShop(port, texts, 'serial-leave');
    const { product, variantId } = await phone(shop);
    const [a, b] = [imei(), imei()];
    await add(shop, product.id, variantId, { quantity: 2, serials: [a, b] });
    await add(shop, product.id, variantId, { quantity: 1 });
    // 3 -> 2 names no serial: the unit without one goes.
    expect(
      (await setStock(shop, product.id, variantId, { onHand: 2, reason: 'damaged_or_lost' }))
        .status,
    ).toBe(200);
    expect(await missing(shop, product.id, variantId)).toBe(0);
    const unnamed = await setStock(shop, product.id, variantId, {
      onHand: 1,
      reason: 'damaged_or_lost',
    });
    expect(unnamed.status).toBe(409);
    const named = await setStock(shop, product.id, variantId, {
      onHand: 1,
      reason: 'damaged_or_lost',
      serials: [a],
    });
    expect(named.status, JSON.stringify(named.body)).toBe(200);
    const writtenOff = (await serialsOf(shop, product.id, variantId, '?status=written_off'))
      .serials;
    expect(writtenOff.map((row) => row.serial)).toEqual([a]);
    expect(writtenOff[0]?.leftMovementId).toBe(
      ((await history(shop, product.id, variantId)) as SerialMovement[])[0]?.id ?? -1,
    );
    // A unit that has left keeps its serial as history.
    const left = writtenOff[0]?.id ?? '';
    expect(
      (await shop.patch(`/products/${product.id}/serials/${left}`, { serial: imei() })).status,
    ).toBe(409);
    expect((await shop.delete(`/products/${product.id}/serials/${left}`)).status).toBe(409);
    // A serial no unit in stock has is not one that can leave.
    const notHeld = await setStock(shop, product.id, variantId, {
      onHand: 0,
      reason: 'damaged_or_lost',
      serials: [imei()],
    });
    expect(fieldsOf(notHeld)).toEqual({ 'serials.0': 'not_found' });
  });

  it('keeps a serial unique among the units the shop holds, and lets one that left come back as a new unit', async () => {
    const shop = await openShop(port, texts, 'serial-unique');
    const first = await phone(shop, 'Phone A');
    const second = await phone(shop, 'Phone B');
    const shared = imei();
    await add(shop, first.product.id, first.variantId, { quantity: 1, serials: [shared] });
    const elsewhere = await add(shop, second.product.id, second.variantId, {
      quantity: 1,
      serials: [shared],
    });
    expect(fieldsOf(elsewhere)).toEqual({ 'serials.0': 'taken' });
    // Written off, then bought back in as a trade-in.
    await setStock(shop, first.product.id, first.variantId, {
      onHand: 0,
      reason: 'damaged_or_lost',
      serials: [shared],
    });
    const back = await add(shop, second.product.id, second.variantId, {
      quantity: 1,
      serials: [shared],
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
  });

  it("takes opening serials at creation, writes them off on made to order, and checks a stock check's missing ones", async () => {
    const shop = await openShop(port, texts, 'serial-open');
    const [a, b, c] = [imei(), imei(), imei()];
    const tooMany = await shop.post('/products', {
      name: 'Phone',
      basePrice: 1000,
      serialTracked: true,
      serialFormat: 'imei',
      variants: [{ optionIds: [], openingStock: 1, openingSerials: [a, b] }],
    });
    expect(fieldsOf(tooMany)).toEqual({ 'variants.0.openingSerials': 'too_many' });
    const created = await create(shop, {
      name: 'Phone',
      basePrice: 1000,
      serialTracked: true,
      serialFormat: 'imei',
      variants: [{ optionIds: [], openingStock: 3, openingSerials: [a, b, c] }],
    });
    const variantId = created.variants[0]?.id ?? '';
    expect((await serialsOf(shop, created.id, variantId)).total).toBe(3);
    const taken = await shop.post('/products', {
      name: 'Phone again',
      basePrice: 1000,
      serialTracked: true,
      serialFormat: 'imei',
      variants: [{ optionIds: [], openingStock: 1, openingSerials: [a] }],
    });
    expect(taken.status).toBe(409);
    expect(fieldsOf(taken)).toEqual({ 'variants.0.openingSerials.0': 'taken' });

    // A check counting 2 of 3 names the one missing.
    const check = await shop.post('/stock-checks', {
      lines: [{ variantId, counted: 2, missingSerials: [c] }],
    });
    expect(check.status, JSON.stringify(check.body)).toBe(201);
    expect(
      (await serialsOf(shop, created.id, variantId, '?status=written_off')).serials.map(
        (row) => row.serial,
      ),
    ).toEqual([c]);
    const unnamed = await shop.post('/stock-checks', { lines: [{ variantId, counted: 1 }] });
    expect(unnamed.status).toBe(409);

    // Made to order: every unit goes, and every serial with it.
    expect(
      (await shop.patch(`/products/${created.id}`, { stockTracking: 'not_tracked' })).status,
    ).toBe(200);
    expect((await serialsOf(shop, created.id, variantId, '?status=written_off')).total).toBe(3);
  });

  it('turns serial tracking on over stock held, off only once no unit holds a serial, and never for a measured unit', async () => {
    const shop = await openShop(port, texts, 'serial-switch');
    const { product, variantId } = await simple(shop, 'Speaker', 4);
    expect((await shop.patch(`/products/${product.id}`, { serialTracked: true })).status).toBe(200);
    expect(await missing(shop, product.id, variantId)).toBe(4);
    await shop.post(`/products/${product.id}/variants/${variantId}/serials`, {
      serials: ['SPK-1'],
    });
    const off = await shop.patch(`/products/${product.id}`, { serialTracked: false });
    expect(off.status).toBe(409);
    expect(fieldsOf(off)).toEqual({ serialTracked: 'not_allowed' });
    const held = (await serialsOf(shop, product.id, variantId)).serials[0]?.id ?? '';
    await shop.delete(`/products/${product.id}/serials/${held}`);
    expect((await shop.patch(`/products/${product.id}`, { serialTracked: false })).status).toBe(
      200,
    );

    const measured = await shop.post('/products', {
      name: 'Rice',
      basePrice: 80,
      stockUnit: 'kg',
      serialTracked: true,
    });
    expect(fieldsOf(measured)).toEqual({ serialTracked: 'not_allowed' });
    const rice = await simple(shop, 'Lentils', 1, { stockUnit: 'kg' });
    const later = await shop.patch(`/products/${rice.product.id}`, { serialTracked: true });
    expect(fieldsOf(later)).toEqual({ serialTracked: 'not_allowed' });
    // A phone shop's products expect IMEIs.
    expect((await shop.put('/business-type', { businessType: 'mobiles_gadgets' })).status).toBe(
      200,
    );
    const gadget = (await shop.post('/products', { name: 'Tablet', basePrice: 1 })).body as {
      serialTracked: boolean;
      serialFormat: string;
    };
    expect(gadget).toMatchObject({ serialTracked: true, serialFormat: 'imei' });
  });

  it('holds the serial rules at the data layer, and keeps another shop out', async () => {
    const shop = await openShop(port, texts, 'serial-db');
    const other = await openShop(port, texts, 'serial-other');
    const { product, variantId } = await phone(shop);
    const a = imei();
    await add(shop, product.id, variantId, { quantity: 1, serials: [a] });
    await expect(
      admin.query(
        `INSERT INTO tenant.serial_numbers (tenant_id, variant_id, serial) VALUES ($1, $2, $3)`,
        [shop.tenantId, variantId, imei()],
      ),
    ).rejects.toThrow(/holds 2 serials for 1(\.000)? units/);
    const plain = await simple(shop, 'Charger', 1);
    await expect(
      admin.query(
        `INSERT INTO tenant.serial_numbers (tenant_id, variant_id, serial) VALUES ($1, $2, 'X')`,
        [shop.tenantId, plain.variantId],
      ),
    ).rejects.toThrow(/only for a serial-numbered product/);
    await expect(
      admin.query('UPDATE tenant.products SET serial_tracked = false WHERE id = $1', [product.id]),
    ).rejects.toThrow(/turned off only while no unit holds a serial/);
    await setStock(shop, product.id, variantId, {
      onHand: 0,
      reason: 'damaged_or_lost',
      serials: [a],
    });
    await expect(
      admin.query("UPDATE tenant.serial_numbers SET status = 'in_stock' WHERE serial = $1", [a]),
    ).rejects.toThrow(/kept as history/);
    await expect(
      admin.query('DELETE FROM tenant.serial_numbers WHERE serial = $1', [a]),
    ).rejects.toThrow(/kept as history/);

    const serial =
      (await serialsOf(shop, product.id, variantId, '?status=written_off')).serials[0]?.id ?? '';
    expect((await other.get(`/products/${product.id}/variants/${variantId}/serials`)).status).toBe(
      404,
    );
    expect(
      (
        await other.post(`/products/${product.id}/variants/${variantId}/serials`, {
          serials: [imei()],
        })
      ).status,
    ).toBe(404);
    expect(
      (await other.patch(`/products/${product.id}/serials/${serial}`, { serial: imei() })).status,
    ).toBe(404);
    expect((await other.delete(`/products/${product.id}/serials/${serial}`)).status).toBe(404);
  });
});
