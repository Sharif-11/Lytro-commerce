import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isValidImei } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 4a: suppliers and purchase orders over HTTP and at the data layer -- drafts with no number, placing one
// with the shop's next gap-free number, changing items until the first delivery, cancelling and deleting, incoming
// stock, who sees cost, the activity log, and another shop kept out. PUR-01 to PUR-03, PUR-05, PUR-10, UOM-03, INV-24,
// D3-9. Slice 4b: receiving -- deliveries with rejects, the weighted average cost, batches and serials on receipt,
// closing short, one-step Add stock and new stock arriving, purchase history, and receipts that never change. PUR-04
// to PUR-09, INV-10. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_purchasing_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
// A fresh database with every migration, and the app booted on it: more than the default 10 s on a busy machine.
const SETUP_TIMEOUT_MS = 30_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'purchasing-e2e-otp-secret-0123456789abcdefg';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  postalAddress: string | null;
  notes: string | null;
  archived: boolean;
}

interface Item {
  id: string;
  productId: string;
  variantId: string;
  productName: string | null;
  optionIds: string[];
  sharedStock: boolean;
  stockUnit: string | null;
  quantityOrdered: string;
  quantityReceived: string;
  outstanding: string;
  unitCost?: string | null;
  total?: string | null;
}

interface Purchase {
  id: string;
  number: number | null;
  status: string;
  supplier: { id: string; name: string | null } | null;
  expectedOn: string | null;
  notes: string | null;
  orderedAt: string | null;
  items: Item[];
  total?: string;
  unknownCost?: number;
}

interface PurchaseList {
  purchaseOrders: (Omit<Purchase, 'items' | 'notes'> & { items: number })[];
  total: number;
}

interface Product {
  id: string;
  variants: { id: string; optionIds: string[]; packAmount: string | null }[];
}

interface Stock {
  shared: { variantId: string; incoming: string; available: string } | null;
  variants: { variantId: string; available: string; incoming: string | null }[];
}

async function product(
  shop: ShopClient,
  name: string,
  openingStock: number | null,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const result = await shop.post('/products', {
    name,
    basePrice: 100,
    variants: [{ optionIds: [], ...(openingStock !== null ? { openingStock } : {}) }],
    ...extra,
  });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const made = result.body as Product;
  return { id: made.id, variantId: made.variants[0]?.id ?? '' };
}

async function supplier(shop: ShopClient, name: string, extra: Record<string, unknown> = {}) {
  const result = await shop.post('/suppliers', { name, ...extra });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Supplier;
}

async function draft(shop: ShopClient, body: Record<string, unknown>): Promise<Purchase> {
  const result = await shop.post('/purchase-orders', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Purchase;
}

async function place(shop: ShopClient, id: string): Promise<Purchase> {
  const result = await shop.post(`/purchase-orders/${id}/place`, {});
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Purchase;
}

/** PUR-04: one delivery against a placed purchase, received. */
async function receive(
  shop: ShopClient,
  id: string,
  items: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Promise<Purchase> {
  const result = await shop.post(`/purchase-orders/${id}/receipts`, { items, ...extra });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Purchase;
}

async function stockOf(shop: ShopClient, productId: string): Promise<Stock> {
  const result = await shop.get(`/products/${productId}/stock`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Stock;
}

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey): string {
  return translate(key, 'bn');
}

function incomingOf(stock: Stock, variantId: string): string | null | undefined {
  return stock.variants.find((row) => row.variantId === variantId)?.incoming;
}

async function actions(
  tenantId: string,
  prefix: string,
): Promise<{ action: string; summary: unknown }[]> {
  const result = await admin.query<{ action: string; summary: unknown }>(
    `SELECT action, summary FROM tenant.activity_log
     WHERE tenant_id = $1 AND action LIKE $2 ORDER BY created_at, id`,
    [tenantId, `${prefix}%`],
  );
  return result.rows;
}

describeIfDatabase('suppliers (PUR-01)', () => {
  it('keeps a supplier, its name unique among the live ones ignoring case, and archives it', async () => {
    const shop = await openShop(port, texts, 'supplier');
    const rahim = await supplier(shop, 'Rahim Traders', {
      phone: ' 01711000000 ',
      email: '',
      postalAddress: 'Chawkbazar, Dhaka',
      notes: 'Pays on delivery',
    });
    expect(rahim).toMatchObject({
      name: 'Rahim Traders',
      phone: '01711000000',
      email: null,
      postalAddress: 'Chawkbazar, Dhaka',
      notes: 'Pays on delivery',
      archived: false,
    });
    const taken = await shop.post('/suppliers', { name: 'rahim traders' });
    expect(taken.status).toBe(409);
    expect(fieldsOf(taken)).toEqual({ name: 'taken' });
    expect(
      fieldsOf(await shop.post('/suppliers', { name: 'Karim', email: 'not-an-email' })),
    ).toEqual({ email: 'invalid_email' });
    await supplier(shop, 'Babul Store');
    const found = (await shop.get('/suppliers?q=STORE')).body as { suppliers: Supplier[] };
    expect(found.suppliers.map((row) => row.name)).toEqual(['Babul Store']);

    const archived = await shop.patch(`/suppliers/${rahim.id}`, { archived: true });
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
    const live = (await shop.get('/suppliers')).body as { suppliers: Supplier[] };
    expect(live.suppliers.map((row) => row.name)).toEqual(['Babul Store']);
    const old = (await shop.get('/suppliers?archived=true')).body as { suppliers: Supplier[] };
    expect(old.suppliers.map((row) => row.name)).toEqual(['Rahim Traders']);
    // The name is free again among the live ones, so bringing the old one back is refused.
    const again = await supplier(shop, 'Rahim Traders');
    const back = await shop.patch(`/suppliers/${rahim.id}`, { archived: false });
    expect(back.status).toBe(409);
    expect(fieldsOf(back)).toEqual({ name: 'taken' });
    const renamed = await shop.patch(`/suppliers/${again.id}`, { name: 'Rahim & Sons', notes: '' });
    expect(renamed.body as Supplier).toMatchObject({ name: 'Rahim & Sons', notes: null });
    expect((await shop.patch(`/suppliers/${rahim.id}`, { archived: false })).status).toBe(200);

    expect((await actions(shop.tenantId, 'supplier_')).map((row) => row.action)).toEqual([
      'supplier_created',
      'supplier_created',
      'supplier_updated',
      'supplier_created',
      'supplier_updated',
      'supplier_updated',
    ]);
  });

  it('offers only a live supplier for a new purchase, and keeps its name on past ones', async () => {
    const shop = await openShop(port, texts, 'supplier-use');
    const { variantId } = await product(shop, 'Rice', 0);
    const babul = await supplier(shop, 'Babul Store');
    const bought = await draft(shop, {
      supplierId: babul.id,
      items: [{ variantId, quantity: 5 }],
    });
    expect(bought.supplier).toEqual({ id: babul.id, name: 'Babul Store' });
    await shop.patch(`/suppliers/${babul.id}`, { archived: true });

    const refused = await shop.post('/purchase-orders', {
      supplierId: babul.id,
      items: [{ variantId, quantity: 5 }],
    });
    expect(refused.status).toBe(409);
    expect(fieldsOf(refused)).toEqual({ supplierId: 'not_allowed' });
    // Placing a draft whose supplier was archived since is refused too, and the draft still names it.
    const placing = await shop.post(`/purchase-orders/${bought.id}/place`, {});
    expect(placing.status).toBe(409);
    expect(fieldsOf(placing)).toEqual({ supplierId: 'not_allowed' });
    const kept = (await shop.get(`/purchase-orders/${bought.id}`)).body as Purchase;
    expect(kept.supplier).toEqual({ id: babul.id, name: 'Babul Store' });
  });
});

describeIfDatabase('drafts, placing and numbers (PUR-02, PUR-03)', () => {
  it('saves a draft with no number, and gives each placed purchase the next number with no gap', async () => {
    const shop = await openShop(port, texts, 'numbers');
    const { variantId } = await product(shop, 'Lamp', 3);
    const first = await draft(shop, {
      expectedOn: '2026-11-01',
      notes: 'Call before coming',
      items: [{ variantId, quantity: 20, unitCost: 750 }],
    });
    expect(first).toMatchObject({
      number: null,
      status: 'draft',
      supplier: null,
      expectedOn: '2026-11-01',
      notes: 'Call before coming',
      orderedAt: null,
      total: '15000.00',
      unknownCost: 0,
    });
    expect(first.items).toEqual([
      expect.objectContaining({
        variantId,
        productName: 'Lamp',
        optionIds: [],
        sharedStock: false,
        stockUnit: 'piece',
        quantityOrdered: '20.000',
        quantityReceived: '0.000',
        outstanding: '20.000',
        unitCost: '750.0000',
        total: '15000.00',
      }),
    ]);
    // A draft deleted before placing takes no number with it.
    const dropped = await draft(shop, { items: [{ variantId, quantity: 1 }] });
    const deleted = await shop.delete(`/purchase-orders/${dropped.id}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect((await shop.get(`/purchase-orders/${dropped.id}`)).status).toBe(404);

    const placed = await place(shop, first.id);
    expect(placed).toMatchObject({ number: 1, status: 'ordered' });
    expect(placed.orderedAt).not.toBeNull();
    const second = await place(
      shop,
      (await draft(shop, { items: [{ variantId, quantity: 2 }] })).id,
    );
    expect(second.number).toBe(2);

    const twice = await shop.post(`/purchase-orders/${first.id}/place`, {});
    expect(twice.status).toBe(409);
    expect(errorOf(twice).code).toBe('conflict');
    const kept = await shop.delete(`/purchase-orders/${first.id}`);
    expect(kept.status).toBe(409);

    const list = (await shop.get('/purchase-orders')).body as PurchaseList;
    expect(list.purchaseOrders.map((row) => row.number)).toEqual([2, 1]);
    expect(list.purchaseOrders[1]).toMatchObject({ items: 1, total: '15000.00', unknownCost: 0 });
    const drafts = (await shop.get('/purchase-orders?status=draft')).body as PurchaseList;
    expect(drafts.total).toBe(0);
  });

  it('gives purchases placed at the same moment consecutive numbers, none repeated', async () => {
    const shop = await openShop(port, texts, 'together');
    const { variantId } = await product(shop, 'Pen', 0);
    const drafts = await Promise.all(
      Array.from({ length: 6 }, () => draft(shop, { items: [{ variantId, quantity: 1 }] })),
    );
    const placed = await Promise.all(
      drafts.map((row) => shop.post(`/purchase-orders/${row.id}/place`, {})),
    );
    expect(placed.map((row) => row.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const numbers = placed.map((row) => (row.body as Purchase).number ?? 0).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('changes a purchase until its first delivery, then only its expected date and notes', async () => {
    const shop = await openShop(port, texts, 'edits');
    const lamp = await product(shop, 'Lamp', 0);
    const rice = await product(shop, 'Rice', 0, { stockUnit: 'kg' });
    const fan = await product(shop, 'Fan', 0);
    const babul = await supplier(shop, 'Babul Store');
    const made = await draft(shop, {
      items: [
        { variantId: lamp.variantId, quantity: 4, unitCost: 100 },
        { variantId: rice.variantId, quantity: 2.5 },
      ],
    });
    const lampItem = made.items[0]?.id;
    const edited = await shop.patch(`/purchase-orders/${made.id}`, {
      supplierId: babul.id,
      notes: 'Second floor',
      items: [
        { variantId: fan.variantId, quantity: 1, unitCost: 1200 },
        { variantId: lamp.variantId, quantity: 6, unitCost: 95.5 },
      ],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const after = edited.body as Purchase;
    expect(after.supplier?.name).toBe('Babul Store');
    expect(after.items.map((row) => [row.productName, row.quantityOrdered, row.unitCost])).toEqual([
      ['Fan', '1.000', '1200.0000'],
      ['Lamp', '6.000', '95.5000'],
    ]);
    // A kept item (same variant) keeps its id; the rice is gone.
    expect(after.items[1]?.id).toBe(lampItem);
    expect(after).toMatchObject({ total: '1773.00', unknownCost: 0 });

    // Placed, its items still change until something is received.
    await place(shop, made.id);
    const stillOpen = await shop.patch(`/purchase-orders/${made.id}`, {
      items: [{ variantId: lamp.variantId, quantity: 8 }],
    });
    expect(stillOpen.status, JSON.stringify(stillOpen.body)).toBe(200);
    expect((stillOpen.body as Purchase).unknownCost).toBe(1);

    // A delivery freezes the items and the supplier.
    await receive(shop, made.id, [
      { itemId: (stillOpen.body as Purchase).items[0]?.id ?? '', accepted: 3 },
    ]);
    const frozen = await shop.patch(`/purchase-orders/${made.id}`, {
      items: [{ variantId: lamp.variantId, quantity: 9 }],
    });
    expect(frozen.status).toBe(409);
    expect(errorOf(frozen).message).toBe(said('PurchaseHasDeliveries'));
    expect((await shop.patch(`/purchase-orders/${made.id}`, { supplierId: null })).status).toBe(
      409,
    );
    const notes = await shop.patch(`/purchase-orders/${made.id}`, {
      expectedOn: '2026-12-01',
      notes: 'Rest next week',
    });
    expect(notes.status, JSON.stringify(notes.body)).toBe(200);
    const cancel = await shop.post(`/purchase-orders/${made.id}/cancel`, {});
    expect(cancel.status).toBe(409);
    expect(errorOf(cancel).message).toBe(said('PurchaseCloseShortInstead'));
  });

  it('cancels a placed purchase with nothing received, and never changes it after', async () => {
    const shop = await openShop(port, texts, 'cancel');
    const { variantId } = await product(shop, 'Lamp', 0);
    const made = await draft(shop, { items: [{ variantId, quantity: 4 }] });
    const early = await shop.post(`/purchase-orders/${made.id}/cancel`, {});
    expect(early.status).toBe(409);
    expect(errorOf(early).message).toBe(said('PurchaseIsDraft'));
    await place(shop, made.id);
    const cancelled = await shop.post(`/purchase-orders/${made.id}/cancel`, {});
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect((cancelled.body as Purchase).status).toBe('cancelled');
    expect((await shop.post(`/purchase-orders/${made.id}/cancel`, {})).status).toBe(409);
    expect((await shop.patch(`/purchase-orders/${made.id}`, { notes: 'x' })).status).toBe(409);

    expect((await actions(shop.tenantId, 'purchase_')).map((row) => row.action)).toEqual([
      'purchase_created',
      'purchase_placed',
      'purchase_cancelled',
    ]);
    const placedEntry = (await actions(shop.tenantId, 'purchase_placed'))[0];
    expect(placedEntry?.summary).toEqual({ number: 1 });
  });
});

describeIfDatabase('what a purchase may buy (PUR-02, UOM-03, INV-02, INV-24)', () => {
  it('refuses, item by item, what cannot be bought, and checks again when a draft is placed', async () => {
    const shop = await openShop(port, texts, 'items');
    const lamp = await product(shop, 'Lamp', 0);
    const custom = await product(shop, 'Cake', null, { stockTracking: 'not_tracked' });
    const other = await openShop(port, texts, 'items-other');
    const theirs = await product(other, 'Theirs', 0);
    const refused = await shop.post('/purchase-orders', {
      items: [
        { variantId: lamp.variantId, quantity: 1.5 },
        { variantId: custom.variantId, quantity: 1 },
        { variantId: theirs.variantId, quantity: 1 },
      ],
    });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toEqual({
      'items.0.quantity': 'not_allowed',
      'items.1.variantId': 'not_allowed',
      'items.2.variantId': 'not_found',
    });
    const twice = await shop.post('/purchase-orders', {
      items: [
        { variantId: lamp.variantId, quantity: 1 },
        { variantId: lamp.variantId, quantity: 2 },
      ],
    });
    expect(fieldsOf(twice)).toEqual({ 'items.1.variantId': 'not_allowed' });
    expect((await shop.get('/purchase-orders')).body).toMatchObject({ total: 0 });

    // A draft whose product turned made to order since is refused when placed.
    const made = await draft(shop, { items: [{ variantId: lamp.variantId, quantity: 2 }] });
    await shop.patch(`/products/${lamp.id}`, { stockTracking: 'not_tracked' });
    const placing = await shop.post(`/purchase-orders/${made.id}/place`, {});
    expect(placing.status).toBe(409);
    expect(fieldsOf(placing)).toEqual({ 'items.0.variantId': 'not_allowed' });
  });

  it('buys a shared stock by the stock itself, never by one of its sizes', async () => {
    const shop = await openShop(port, texts, 'shared');
    const size = (
      (await shop.get('/attributes')).body as { id: string; name: string; scope: string }[]
    ).find((row) => row.name === 'Size' && row.scope === 'platform')?.id;
    const options = (
      (await shop.post(`/attributes/${size ?? ''}/options/batch`, { values: ['3 ml', '6 ml'] }))
        .body as { id: string }[]
    ).map((row) => row.id);
    const created = await shop.post('/products', {
      name: 'Oud',
      basePrice: 10,
      stockUnit: 'ml',
      sharedStock: true,
      variantAttributes: [{ attributeId: size, optionIds: options }],
      variants: options.map((id, index) => ({ optionIds: [id], packAmount: (index + 1) * 3 })),
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const oud = created.body as Product;
    const before = await stockOf(shop, oud.id);
    const holder = before.shared?.variantId ?? '';
    const pack = oud.variants[0]?.id ?? '';

    const bySize = await shop.post('/purchase-orders', {
      items: [{ variantId: pack, quantity: 1 }],
    });
    expect(fieldsOf(bySize)).toEqual({ 'items.0.variantId': 'not_allowed' });
    const made = await draft(shop, {
      items: [{ variantId: holder, quantity: 250.5, unitCost: 4 }],
    });
    expect(made.items[0]).toMatchObject({
      productName: 'Oud',
      optionIds: [],
      sharedStock: true,
      stockUnit: 'ml',
      quantityOrdered: '250.500',
    });
    await place(shop, made.id);
    const after = await stockOf(shop, oud.id);
    expect(after.shared).toMatchObject({ incoming: '250.500', available: '0.000' });
    expect(after.variants.map((row) => row.incoming)).toEqual([null, null]);
  });
});

describeIfDatabase('incoming stock (PUR-05)', () => {
  it('counts what is ordered and not yet received on placed, open purchases, never as available', async () => {
    const shop = await openShop(port, texts, 'incoming');
    const lamp = await product(shop, 'Lamp', 3);
    const made = await draft(shop, { items: [{ variantId: lamp.variantId, quantity: 20 }] });
    expect(incomingOf(await stockOf(shop, lamp.id), lamp.variantId)).toBe('0.000');
    await place(shop, made.id);
    const placed = await stockOf(shop, lamp.id);
    expect(placed.variants[0]).toMatchObject({ available: '3.000', incoming: '20.000' });
    const more = await place(
      shop,
      (await draft(shop, { items: [{ variantId: lamp.variantId, quantity: 5 }] })).id,
    );
    expect(incomingOf(await stockOf(shop, lamp.id), lamp.variantId)).toBe('25.000');

    await receive(shop, made.id, [{ itemId: made.items[0]?.id ?? '', accepted: 8 }]);
    expect(incomingOf(await stockOf(shop, lamp.id), lamp.variantId)).toBe('17.000');
    const item = ((await shop.get(`/purchase-orders/${made.id}`)).body as Purchase).items[0];
    expect(item).toMatchObject({ quantityReceived: '8.000', outstanding: '12.000' });
    await shop.post(`/purchase-orders/${more.id}/cancel`, {});
    expect(incomingOf(await stockOf(shop, lamp.id), lamp.variantId)).toBe('12.000');
  });
});

describeIfDatabase('cost, who sees it, and the data layer (D3-9, PUR-02, PUR-03, UOM-03)', () => {
  it('shows costs only with inventory:manage, and lets inventory:read look without changing', async () => {
    const shop = await openShop(port, texts, 'readers');
    const { variantId } = await product(shop, 'Lamp', 0);
    const made = await draft(shop, { items: [{ variantId, quantity: 2, unitCost: 300 }] });
    const reader = await staffWith(port, texts, admin, shop, ['inventory:read']);
    const seen = await getJson(port, `/purchase-orders/${made.id}`, reader);
    expect(seen.status).toBe(200);
    expect(seen.body).not.toHaveProperty('total');
    expect((seen.body as Purchase).items[0]).not.toHaveProperty('unitCost');
    expect((seen.body as Purchase).items[0]).not.toHaveProperty('total');
    const listed = await getJson(port, '/purchase-orders', reader);
    expect((listed.body as PurchaseList).purchaseOrders[0]).not.toHaveProperty('total');
    expect((await getJson(port, '/suppliers', reader)).status).toBe(200);
    expect((await postJson(port, '/suppliers', { name: 'Nope' }, reader)).status).toBe(403);
    expect((await postJson(port, `/purchase-orders/${made.id}/place`, {}, reader)).status).toBe(
      403,
    );
  });

  it('holds the purchase rules at the data layer', async () => {
    const shop = await openShop(port, texts, 'rules');
    const lamp = await product(shop, 'Lamp', 0);
    const rice = await product(shop, 'Rice', 0, { stockUnit: 'kg' });
    const placed = await place(
      shop,
      (await draft(shop, { items: [{ variantId: lamp.variantId, quantity: 1 }] })).id,
    );
    const open = await draft(shop, { items: [{ variantId: rice.variantId, quantity: 2.5 }] });

    await expect(
      admin.query('UPDATE tenant.purchase_orders SET number = 99 WHERE id = $1', [placed.id]),
    ).rejects.toThrow(/keeps its number/);
    await expect(
      admin.query(
        "UPDATE tenant.purchase_orders SET status = 'draft', number = NULL, ordered_at = NULL WHERE id = $1",
        [placed.id],
      ),
    ).rejects.toThrow(/keeps its number/);
    await expect(
      admin.query('DELETE FROM tenant.purchase_orders WHERE id = $1', [placed.id]),
    ).rejects.toThrow(/cancel it instead/);
    await expect(
      admin.query("UPDATE tenant.purchase_orders SET status = 'ordered' WHERE id = $1", [open.id]),
    ).rejects.toThrow(/purchase_orders_number_check/);
    await expect(
      admin.query(
        `INSERT INTO tenant.purchase_order_lines
           (tenant_id, purchase_order_id, product_id, variant_id, position, quantity_ordered)
         VALUES ($1, $2, $3, $4, 1, 1.5)`,
        [shop.tenantId, placed.id, lamp.id, lamp.variantId],
      ),
    ).rejects.toThrow(/whole units/);
    await expect(
      admin.query(
        `INSERT INTO tenant.purchase_order_lines
           (tenant_id, purchase_order_id, product_id, variant_id, position, quantity_ordered)
         VALUES ($1, $2, $3, $4, 1, 1)`,
        [shop.tenantId, placed.id, rice.id, lamp.variantId],
      ),
    ).rejects.toThrow(/is not one of product/);
    // PUR-04: what an item has received moves only with a receipt.
    await expect(
      admin.query(
        'UPDATE tenant.purchase_order_lines SET quantity_received = 1 WHERE purchase_order_id = $1',
        [placed.id],
      ),
    ).rejects.toThrow(/moves only with a receipt/);
    await receive(shop, placed.id, [{ itemId: placed.items[0]?.id ?? '', accepted: 1 }]);
    await expect(
      admin.query('DELETE FROM tenant.purchase_order_lines WHERE purchase_order_id = $1', [
        placed.id,
      ]),
    ).rejects.toThrow(/kept as history/);
    await expect(
      admin.query(
        'UPDATE tenant.purchase_order_lines SET variant_id = $2 WHERE purchase_order_id = $1',
        [placed.id, rice.variantId],
      ),
    ).rejects.toThrow(/keeps its variant/);

    // UOM-03: a product an open purchase buys a fraction of stays in a measured unit.
    const unit = await shop.patch(`/products/${rice.id}`, { stockUnit: 'piece' });
    expect(fieldsOf(unit)).toEqual({ stockUnit: 'not_allowed' });
    await shop.delete(`/purchase-orders/${open.id}`);
    expect((await shop.patch(`/products/${rice.id}`, { stockUnit: 'piece' })).status).toBe(200);
  });
});

describeIfDatabase("one shop never reaches another shop's purchasing (SEC-02, TEN-03)", () => {
  it("answers not_found for another shop's suppliers, purchases and variants", async () => {
    const shop = await openShop(port, texts, 'mine');
    const other = await openShop(port, texts, 'theirs');
    const { variantId } = await product(other, 'Lamp', 0);
    const theirSupplier = await supplier(other, 'Their Supplier');
    const theirs = await draft(other, {
      supplierId: theirSupplier.id,
      items: [{ variantId, quantity: 1 }],
    });
    const mine = await product(shop, 'Mine', 0);

    expect((await shop.get(`/suppliers/${theirSupplier.id}`)).status).toBe(404);
    expect(
      (await shop.patch(`/suppliers/${theirSupplier.id}`, { name: 'Taken over' })).status,
    ).toBe(404);
    expect(((await shop.get('/suppliers')).body as { total: number }).total).toBe(0);
    expect((await shop.get(`/purchase-orders/${theirs.id}`)).status).toBe(404);
    expect((await shop.patch(`/purchase-orders/${theirs.id}`, { notes: 'x' })).status).toBe(404);
    expect((await shop.post(`/purchase-orders/${theirs.id}/place`, {})).status).toBe(404);
    expect((await shop.post(`/purchase-orders/${theirs.id}/cancel`, {})).status).toBe(404);
    expect((await shop.delete(`/purchase-orders/${theirs.id}`)).status).toBe(404);
    expect(((await shop.get('/purchase-orders')).body as PurchaseList).total).toBe(0);

    const withTheirSupplier = await shop.post('/purchase-orders', {
      supplierId: theirSupplier.id,
      items: [{ variantId: mine.variantId, quantity: 1 }],
    });
    expect(fieldsOf(withTheirSupplier)).toEqual({ supplierId: 'not_found' });
    const mineDraft = await draft(shop, { items: [{ variantId: mine.variantId, quantity: 1 }] });
    const withTheirVariant = await shop.patch(`/purchase-orders/${mineDraft.id}`, {
      items: [{ variantId, quantity: 1 }],
    });
    expect(fieldsOf(withTheirVariant)).toEqual({ 'items.0.variantId': 'not_found' });
    expect(((await other.get(`/purchase-orders/${theirs.id}`)).body as Purchase).status).toBe(
      'draft',
    );
  });
});

interface Movement {
  delta: string;
  reason: string;
  unitCost?: string | null;
}

interface StockRow {
  variantId: string;
  onHand: string | null;
  available: string;
  incoming: string | null;
  avgCost?: string | null;
}

interface History {
  purchases: {
    number: number | null;
    supplier: { id: string; name: string | null } | null;
    accepted: string;
    rejected: string;
    unitCost?: string | null;
  }[];
  total: number;
}

let serialNumber = 0;

/** A valid IMEI no other test uses. */
function imei(): string {
  serialNumber += 1;
  const body = `35${String(Date.now()).slice(-6)}${String(serialNumber).padStart(6, '0')}`;
  for (let digit = 0; digit <= 9; digit += 1) {
    if (isValidImei(`${body}${String(digit)}`)) return `${body}${String(digit)}`;
  }
  throw new Error('no check digit');
}

/** A purchase placed with the supplier, buying these items. */
async function placed(shop: ShopClient, items: Record<string, unknown>[]): Promise<Purchase> {
  return place(shop, (await draft(shop, { items })).id);
}

async function rowOf(shop: ShopClient, productId: string, variantId: string): Promise<StockRow> {
  const stock = (await stockOf(shop, productId)) as unknown as { variants: StockRow[] };
  const found = stock.variants.find((row) => row.variantId === variantId);
  if (!found) throw new Error(`no variant ${variantId}`);
  return found;
}

async function movementsOf(shop: ShopClient, productId: string, variantId: string) {
  const result = await shop.get(`/products/${productId}/variants/${variantId}/stock-history`);
  return (result.body as { movements: Movement[] }).movements;
}

describeIfDatabase('receiving a delivery (PUR-04, PUR-05, INV-10)', () => {
  it('receives 18 accepted and 2 rejected of 20 at 750 onto 3 at 700: 21 held at 742.86, 2 to come', async () => {
    const shop = await openShop(port, texts, 'receive');
    const lamp = await product(shop, 'Lamp', 3);
    await shop.put(`/products/${lamp.id}/variants/${lamp.variantId}/cost`, { avgCost: 700 });
    const order = await placed(shop, [{ variantId: lamp.variantId, quantity: 20, unitCost: 750 }]);
    const itemId = order.items[0]?.id ?? '';

    const first = await receive(shop, order.id, [
      { itemId, accepted: 18, rejected: 2, rejectReason: 'Cracked glass' },
    ]);
    expect(first).toMatchObject({ status: 'partially_received' });
    expect(first.items[0]).toMatchObject({ quantityReceived: '18.000', outstanding: '2.000' });
    const receipts = (first as unknown as { receipts: { items: Record<string, unknown>[] }[] })
      .receipts;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.items).toEqual([
      {
        itemId,
        accepted: '18.000',
        rejected: '2.000',
        rejectReason: 'Cracked glass',
        unitCost: '750.0000',
        batch: null,
      },
    ]);
    expect(await rowOf(shop, lamp.id, lamp.variantId)).toMatchObject({
      onHand: '21.000',
      available: '21.000',
      incoming: '2.000',
      avgCost: '742.8571',
    });
    expect((await movementsOf(shop, lamp.id, lamp.variantId))[0]).toMatchObject({
      delta: '18.000',
      reason: 'purchase_receipt',
      unitCost: '750.0000',
    });
    // INV-10: a receipt carrying a cost now keeps the average, so it is no longer typed in.
    const typed = await shop.put(`/products/${lamp.id}/variants/${lamp.variantId}/cost`, {
      avgCost: 1,
    });
    expect(typed.status).toBe(409);

    const second = await receive(shop, order.id, [{ itemId, accepted: 2, unitCost: 760 }]);
    expect(second).toMatchObject({ status: 'received' });
    expect(await rowOf(shop, lamp.id, lamp.variantId)).toMatchObject({
      onHand: '23.000',
      incoming: '0.000',
      avgCost: '744.3478',
    });
    const more = await shop.post(`/purchase-orders/${order.id}/receipts`, {
      items: [{ itemId, accepted: 1 }],
    });
    expect(more.status).toBe(409);
    expect(errorOf(more).message).toBe(said('PurchaseFinished'));
    expect((await actions(shop.tenantId, 'purchase_received')).map((row) => row.summary)).toEqual([
      expect.objectContaining({ number: 1, items: 1 }),
      expect.objectContaining({ number: 1, items: 1 }),
    ]);
  });

  it('refuses, item by item, what a delivery cannot bring, and a purchase not placed or not open', async () => {
    const shop = await openShop(port, texts, 'receive-bad');
    const lamp = await product(shop, 'Lamp', 0);
    const other = await placed(shop, [{ variantId: lamp.variantId, quantity: 3 }]);
    const order = await placed(shop, [{ variantId: lamp.variantId, quantity: 5 }]);
    const itemId = order.items[0]?.id ?? '';
    const post = (items: Record<string, unknown>[]) =>
      shop.post(`/purchase-orders/${order.id}/receipts`, { items });

    expect(fieldsOf(await post([{ itemId, accepted: 4, rejected: 2, rejectReason: 'x' }]))).toEqual(
      { 'items.0.accepted': 'not_allowed' },
    );
    expect(fieldsOf(await post([{ itemId, accepted: 1, rejected: 1 }]))).toEqual({
      'items.0.rejectReason': 'required',
    });
    expect(fieldsOf(await post([{ itemId, accepted: 1, rejectReason: 'x' }]))).toEqual({
      'items.0.rejectReason': 'not_allowed',
    });
    expect(fieldsOf(await post([{ itemId, accepted: 0 }]))).toEqual({
      'items.0.accepted': 'not_allowed',
    });
    expect(fieldsOf(await post([{ itemId, accepted: 1.5 }]))).toEqual({
      'items.0.accepted': 'not_allowed',
    });
    expect(fieldsOf(await post([{ itemId: other.items[0]?.id, accepted: 1 }]))).toEqual({
      'items.0.itemId': 'not_found',
    });
    expect(fieldsOf(await post([{ itemId, accepted: 1, batch: { batchCode: 'L1' } }]))).toEqual({
      'items.0.batch': 'not_allowed',
    });
    expect(fieldsOf(await post([{ itemId, accepted: 1, serials: [imei()] }]))).toEqual({
      'items.0.serials': 'not_allowed',
    });
    expect((await rowOf(shop, lamp.id, lamp.variantId)).onHand).toBe('0.000');

    const notPlaced = await draft(shop, { items: [{ variantId: lamp.variantId, quantity: 1 }] });
    const early = await shop.post(`/purchase-orders/${notPlaced.id}/receipts`, {
      items: [{ itemId: notPlaced.items[0]?.id, accepted: 1 }],
    });
    expect(early.status).toBe(409);
    expect(errorOf(early).message).toBe(said('PlaceBeforeReceiving'));
    await shop.post(`/purchase-orders/${other.id}/cancel`, {});
    const cancelled = await shop.post(`/purchase-orders/${other.id}/receipts`, {
      items: [{ itemId: other.items[0]?.id, accepted: 1 }],
    });
    expect(errorOf(cancelled).message).toBe(said('PurchaseFinished'));
  });

  it('records a delivery rejected in full, then closes the purchase short with no stock change', async () => {
    const shop = await openShop(port, texts, 'close');
    const rice = await product(shop, 'Rice', 2, { stockUnit: 'kg' });
    const order = await placed(shop, [{ variantId: rice.variantId, quantity: 50 }]);
    const itemId = order.items[0]?.id ?? '';
    const nothing = await shop.post(`/purchase-orders/${order.id}/close`, { reason: 'x' });
    expect(nothing.status).toBe(409);
    expect(errorOf(nothing).message).toBe(said('NothingReceivedCancelInstead'));

    const rejected = await receive(shop, order.id, [
      { itemId, accepted: 0, rejected: 12.5, rejectReason: 'Wet sacks' },
    ]);
    expect(rejected.status).toBe('ordered');
    expect((await rowOf(shop, rice.id, rice.variantId)).incoming).toBe('50.000');
    expect(
      (
        await shop.patch(`/purchase-orders/${order.id}`, {
          items: [{ variantId: rice.variantId, quantity: 1 }],
        })
      ).status,
    ).toBe(409);
    const cancel = await shop.post(`/purchase-orders/${order.id}/cancel`, {});
    expect(errorOf(cancel).message).toBe(said('PurchaseCloseShortInstead'));

    await receive(shop, order.id, [{ itemId, accepted: 20.25 }]);
    const closed = await shop.post(`/purchase-orders/${order.id}/close`, {
      reason: 'Supplier ran out',
    });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body as Purchase).toMatchObject({
      status: 'closed_short',
      closeReason: 'Supplier ran out',
    });
    expect(await rowOf(shop, rice.id, rice.variantId)).toMatchObject({
      onHand: '22.250',
      incoming: '0.000',
    });
    expect(
      (await shop.post(`/purchase-orders/${order.id}/close`, { reason: 'again' })).status,
    ).toBe(409);
    expect((await actions(shop.tenantId, 'purchase_closed_short'))[0]?.summary).toEqual({
      number: 1,
      reason: 'Supplier ran out',
      dropped: 1,
    });
  });

  it('keeps the average from costed receipts only, and the typed cost until one arrives', async () => {
    const shop = await openShop(port, texts, 'average');
    const fan = await product(shop, 'Fan', 4);
    const fanPurchase = await placed(shop, [
      { variantId: fan.variantId, quantity: 10, unitCost: 900 },
    ]);
    const fanItem = fanPurchase.items[0];
    const fanOrder = fanPurchase.id;
    // A cost left unknown (null) moves no average and keeps the cost typed by hand.
    await receive(shop, fanOrder, [{ itemId: fanItem?.id, accepted: 2, unitCost: null }]);
    expect((await rowOf(shop, fan.id, fan.variantId)).avgCost).toBeNull();
    expect((await movementsOf(shop, fan.id, fan.variantId))[0]?.unitCost).toBeNull();
    const typed = await shop.put(`/products/${fan.id}/variants/${fan.variantId}/cost`, {
      avgCost: 800,
    });
    expect(typed.status, JSON.stringify(typed.body)).toBe(200);
    // Left out, the cost is the one on the item: (6 x 800 + 3 x 900) / 9.
    await receive(shop, fanOrder, [{ itemId: fanItem?.id, accepted: 3 }]);
    expect((await rowOf(shop, fan.id, fan.variantId)).avgCost).toBe('833.3333');

    // With nothing held, a receipt's cost is the average, whatever it was before.
    const pen = await product(shop, 'Pen', 0);
    await shop.put(`/products/${pen.id}/variants/${pen.variantId}/cost`, { avgCost: 5 });
    const penOrder = await placed(shop, [{ variantId: pen.variantId, quantity: 100, unitCost: 8 }]);
    await receive(shop, penOrder.id, [{ itemId: penOrder.items[0]?.id, accepted: 100 }]);
    expect((await rowOf(shop, pen.id, pen.variantId)).avgCost).toBe('8.0000');
  });

  it('lands a delivery in a batch, with serials, as stock added does (INV-12, INV-14)', async () => {
    const shop = await openShop(port, texts, 'receive-batch');
    const cream = await product(shop, 'Face cream', 0, { batchTracked: true });
    const phone = await product(shop, 'Phone', 0, { serialTracked: true, serialFormat: 'imei' });
    const order = await placed(shop, [
      { variantId: cream.variantId, quantity: 12 },
      { variantId: phone.variantId, quantity: 3 },
    ]);
    const [creamItem, phoneItem] = order.items;
    const [one, two] = [imei(), imei()];
    const tooMany = await shop.post(`/purchase-orders/${order.id}/receipts`, {
      items: [{ itemId: phoneItem?.id, accepted: 1, serials: [one, two] }],
    });
    expect(fieldsOf(tooMany)).toEqual({ 'items.0.serials': 'too_many' });
    const nothingAccepted = await shop.post(`/purchase-orders/${order.id}/receipts`, {
      items: [
        { itemId: phoneItem?.id, accepted: 0, rejected: 1, rejectReason: 'x', serials: [one] },
      ],
    });
    expect(fieldsOf(nothingAccepted)).toEqual({ 'items.0.serials': 'not_allowed' });

    const got = await receive(shop, order.id, [
      {
        itemId: creamItem?.id,
        accepted: 12,
        batch: { batchCode: 'LOT-7', expiresOn: '2031-01-31' },
      },
      { itemId: phoneItem?.id, accepted: 2, serials: [one, two] },
    ]);
    const lines = (got as unknown as { receipts: { items: { batch: unknown }[] }[] }).receipts[0]
      ?.items;
    expect(lines?.[0]?.batch).toMatchObject({ batchCode: 'LOT-7', expiresOn: '2031-01-31' });
    expect(lines?.[1]?.batch).toBeNull();
    const batches = (await shop.get(`/products/${cream.id}/batches`)).body as {
      batches: { batchCode: string | null; quantity: string }[];
    };
    expect(batches.batches).toEqual([
      expect.objectContaining({ batchCode: 'LOT-7', quantity: '12.000' }),
    ]);
    const serials = (await shop.get(`/products/${phone.id}/variants/${phone.variantId}/serials`))
      .body as { serials: { serial: string }[] };
    expect(serials.serials.map((row) => row.serial).sort()).toEqual([one, two].sort());
  });

  it('refuses an item whose product has changed since, which can still be closed short', async () => {
    const shop = await openShop(port, texts, 'changed');
    const lamp = await product(shop, 'Lamp', 0);
    const fan = await product(shop, 'Fan', 0);
    const order = await placed(shop, [
      { variantId: lamp.variantId, quantity: 2 },
      { variantId: fan.variantId, quantity: 2 },
    ]);
    await receive(shop, order.id, [{ itemId: order.items[0]?.id, accepted: 2 }]);
    await shop.patch(`/products/${fan.id}`, { stockTracking: 'not_tracked' });
    const refused = await shop.post(`/purchase-orders/${order.id}/receipts`, {
      items: [{ itemId: order.items[1]?.id, accepted: 2 }],
    });
    expect(fieldsOf(refused)).toEqual({ 'items.0.itemId': 'not_allowed' });
    const closed = await shop.post(`/purchase-orders/${order.id}/close`, {
      reason: 'Fan no longer stocked',
    });
    expect((closed.body as Purchase).status).toBe('closed_short');
  });

  it('gives two deliveries at once for the last units one each, never both (PUR-04)', async () => {
    const shop = await openShop(port, texts, 'race');
    const lamp = await product(shop, 'Lamp', 0);
    const order = await placed(shop, [{ variantId: lamp.variantId, quantity: 5 }]);
    const itemId = order.items[0]?.id ?? '';
    const results = await Promise.all(
      [1, 2].map(() =>
        shop.post(`/purchase-orders/${order.id}/receipts`, { items: [{ itemId, accepted: 5 }] }),
      ),
    );
    // The first takes the last units, so the purchase is received and the second finds it finished.
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
    expect((await rowOf(shop, lamp.id, lamp.variantId)).onHand).toBe('5.000');
  });
});

describeIfDatabase('stock arriving in one step (PUR-07)', () => {
  it('records Add stock as a numbered purchase received in full, with a supplier found or added', async () => {
    const shop = await openShop(port, texts, 'one-step');
    const lamp = await product(shop, 'Lamp', 0);
    const add = (body: Record<string, unknown>) =>
      shop.post(`/products/${lamp.id}/variants/${lamp.variantId}/stock-additions`, body);
    const first = await add({ quantity: 20, supplierName: 'Karim Traders', unitCost: 750 });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(await rowOf(shop, lamp.id, lamp.variantId)).toMatchObject({
      onHand: '20.000',
      incoming: '0.000',
      avgCost: '750.0000',
    });
    const again = await add({ quantity: 5, supplierName: '  karim TRADERS ' });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const suppliers = (await shop.get('/suppliers')).body as { suppliers: Supplier[] };
    expect(suppliers.suppliers.map((row) => row.name)).toEqual(['Karim Traders']);

    const list = (await shop.get('/purchase-orders')).body as PurchaseList;
    expect(
      list.purchaseOrders.map((row) => [row.number, row.status, row.supplier?.name, row.items]),
    ).toEqual([
      [2, 'received', 'Karim Traders', 1],
      [1, 'received', 'Karim Traders', 1],
    ]);
    expect((await movementsOf(shop, lamp.id, lamp.variantId))[0]).toMatchObject({
      delta: '5.000',
      reason: 'purchase_receipt',
      unitCost: null,
    });
    // A cost-less receipt leaves the average, 750 on 20, as it was.
    expect((await rowOf(shop, lamp.id, lamp.variantId)).avgCost).toBe('750.0000');

    const karim = suppliers.suppliers[0]?.id ?? '';
    await shop.patch(`/suppliers/${karim}`, { archived: true });
    const archived = await add({ quantity: 1, supplierId: karim });
    expect(archived.status).toBe(409);
    expect(fieldsOf(archived)).toEqual({ supplierId: 'not_allowed' });
    expect(fieldsOf(await add({ quantity: 1, supplierId: karim, supplierName: 'x' }))).toEqual({
      supplierName: 'not_allowed',
    });
    expect((await actions(shop.tenantId, 'purchase_received'))[0]?.summary).toMatchObject({
      number: 1,
      oneStep: true,
    });
  });

  it('gives two arrivals typing one new supplier name at once that one supplier', async () => {
    const shop = await openShop(port, texts, 'supplier-race');
    const lamp = await product(shop, 'Lamp', 0);
    const fan = await product(shop, 'Fan', 0);
    // Different products, so the two arrivals do not wait on one stock level and truly overlap.
    for (let round = 0; round < 5; round += 1) {
      const name = `Race Traders ${String(round)}`;
      const results = await Promise.all(
        [lamp, fan].map((made) =>
          shop.post(`/products/${made.id}/variants/${made.variantId}/stock-additions`, {
            quantity: 1,
            supplierName: name,
          }),
        ),
      );
      expect(
        results.map((row) => row.status),
        JSON.stringify(results.map((row) => row.body)),
      ).toEqual([200, 200]);
    }
    const suppliers = (await shop.get('/suppliers?limit=100')).body as { suppliers: Supplier[] };
    expect(suppliers.suppliers.map((row) => row.name)).toEqual([
      'Race Traders 0',
      'Race Traders 1',
      'Race Traders 2',
      'Race Traders 3',
      'Race Traders 4',
    ]);
    const added = await actions(shop.tenantId, 'supplier_created');
    expect(added).toHaveLength(5);
  });

  it('records new stock arriving on a stock edit as a purchase, keeping the typed cost', async () => {
    const shop = await openShop(port, texts, 'arrived');
    const jar = await product(shop, 'Jar', 4);
    const edited = await shop.put(`/products/${jar.id}/variants/${jar.variantId}/stock`, {
      onHand: 10,
      reason: 'new_stock',
      note: 'From the market',
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const list = (await shop.get('/purchase-orders')).body as PurchaseList;
    expect(list.purchaseOrders[0]).toMatchObject({ number: 1, status: 'received', supplier: null });
    const purchase = (await shop.get(`/purchase-orders/${list.purchaseOrders[0]?.id ?? ''}`))
      .body as Purchase & { receipts: { note: string | null }[] };
    expect(purchase.items[0]).toMatchObject({ quantityOrdered: '6.000', unitCost: null });
    expect(purchase.receipts[0]?.note).toBe('From the market');
    // INV-10: a receipt with no cost leaves the cost to be typed by hand.
    const typed = await shop.put(`/products/${jar.id}/variants/${jar.variantId}/cost`, {
      avgCost: 45,
    });
    expect(typed.status, JSON.stringify(typed.body)).toBe(200);
  });

  it('adds packs of a size to the shared stock, at a cost per pack made a cost per unit (INV-24)', async () => {
    const shop = await openShop(port, texts, 'pack-add');
    const size = (
      (await shop.get('/attributes')).body as { id: string; name: string; scope: string }[]
    ).find((row) => row.name === 'Size' && row.scope === 'platform')?.id;
    const options = (
      (await shop.post(`/attributes/${size ?? ''}/options/batch`, { values: ['100 ml'] })).body as {
        id: string;
      }[]
    ).map((row) => row.id);
    const created = await shop.post('/products', {
      name: 'Oud',
      basePrice: 10,
      stockUnit: 'ml',
      sharedStock: true,
      variantAttributes: [{ attributeId: size, optionIds: options }],
      variants: [{ optionIds: [options[0]], packAmount: 100 }],
    });
    const oud = created.body as Product;
    const bottle = oud.variants[0]?.id ?? '';
    const added = await shop.post(`/products/${oud.id}/variants/${bottle}/stock-additions`, {
      quantity: 2,
      unitCost: 500,
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const stock = (await stockOf(shop, oud.id)) as unknown as {
      shared: { variantId: string; onHand: string; avgCost: string };
    };
    expect(stock.shared).toMatchObject({ onHand: '200.000', avgCost: '5.0000' });
    const list = (await shop.get('/purchase-orders')).body as PurchaseList;
    const purchase = (await shop.get(`/purchase-orders/${list.purchaseOrders[0]?.id ?? ''}`))
      .body as Purchase;
    expect(purchase.items[0]).toMatchObject({
      variantId: stock.shared.variantId,
      sharedStock: true,
      quantityOrdered: '200.000',
      unitCost: '5.0000',
    });
    expect((await shop.get(`/products/${oud.id}/variants/${bottle}/purchases`)).status).toBe(409);
  });

  it('keeps the average right when two arrivals land on one variant at once', async () => {
    const shop = await openShop(port, texts, 'arrivals-race');
    const lamp = await product(shop, 'Lamp', 0);
    const results = await Promise.all(
      [100, 200].map((unitCost) =>
        shop.post(`/products/${lamp.id}/variants/${lamp.variantId}/stock-additions`, {
          quantity: 10,
          unitCost,
        }),
      ),
    );
    expect(results.map((row) => row.status)).toEqual([200, 200]);
    expect(await rowOf(shop, lamp.id, lamp.variantId)).toMatchObject({
      onHand: '20.000',
      avgCost: '150.0000',
    });
    const numbers = ((await shop.get('/purchase-orders')).body as PurchaseList).purchaseOrders
      .map((row) => row.number)
      .sort();
    expect(numbers).toEqual([1, 2]);
  });
});

describeIfDatabase('arrivals racing stock edits (INV-01, PUR-03)', () => {
  it('lets a stock edit and an addition arrive on one variant at once, every time', async () => {
    const shop = await openShop(port, texts, 'arrival-locks');
    const lamp = await product(shop, 'Lamp', 0);
    let held = 0;
    for (let round = 0; round < 8; round += 1) {
      const [edited, added] = await Promise.all([
        shop.put(`/products/${lamp.id}/variants/${lamp.variantId}/stock`, {
          onHand: held + 100,
          reason: 'new_stock',
        }),
        shop.post(`/products/${lamp.id}/variants/${lamp.variantId}/stock-additions`, {
          quantity: 1,
        }),
      ]);
      expect([edited.status, added.status], JSON.stringify([edited.body, added.body])).toEqual([
        200, 200,
      ]);
      held = Number((await rowOf(shop, lamp.id, lamp.variantId)).onHand);
    }
  });
});

describeIfDatabase('purchase history and receipts that never change (PUR-08, PUR-09)', () => {
  it("shows a variant's deliveries, newest first, each with its own cost; cost only with inventory:manage", async () => {
    const shop = await openShop(port, texts, 'history');
    const lamp = await product(shop, 'Lamp', 0);
    const babul = await supplier(shop, 'Babul Store');
    const first = await place(
      shop,
      (
        await draft(shop, {
          supplierId: babul.id,
          items: [{ variantId: lamp.variantId, quantity: 4, unitCost: 300 }],
        })
      ).id,
    );
    await receive(shop, first.id, [{ itemId: first.items[0]?.id, accepted: 4 }]);
    await shop.post(`/products/${lamp.id}/variants/${lamp.variantId}/stock-additions`, {
      quantity: 6,
      unitCost: 320,
    });
    const history = (await shop.get(`/products/${lamp.id}/variants/${lamp.variantId}/purchases`))
      .body as History;
    expect(history.total).toBe(2);
    expect(
      history.purchases.map((row) => [
        row.number,
        row.supplier?.name ?? null,
        row.accepted,
        row.unitCost,
      ]),
    ).toEqual([
      [2, null, '6.000', '320.0000'],
      [1, 'Babul Store', '4.000', '300.0000'],
    ]);
    const reader = await staffWith(port, texts, admin, shop, ['inventory:read']);
    const seen = await getJson(
      port,
      `/products/${lamp.id}/variants/${lamp.variantId}/purchases`,
      reader,
    );
    expect(seen.status).toBe(200);
    expect((seen.body as History).purchases[0]).not.toHaveProperty('unitCost');
    const purchase = await getJson(port, `/purchase-orders/${first.id}`, reader);
    const delivered = (purchase.body as { receipts: { items: Record<string, unknown>[] }[] })
      .receipts[0]?.items[0];
    expect(delivered).not.toHaveProperty('unitCost');
    expect(
      (await postJson(port, `/purchase-orders/${first.id}/close`, { reason: 'x' }, reader)).status,
    ).toBe(403);
  });

  it('holds the receiving rules at the data layer', async () => {
    const shop = await openShop(port, texts, 'receipt-rules');
    const lamp = await product(shop, 'Lamp', 0);
    const order = await placed(shop, [{ variantId: lamp.variantId, quantity: 4 }]);
    await receive(shop, order.id, [{ itemId: order.items[0]?.id, accepted: 1 }]);
    const receipt = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.purchase_receipts WHERE purchase_order_id = $1',
      [order.id],
    );
    const receiptId = receipt.rows[0]?.id;
    await expect(
      admin.query("UPDATE tenant.purchase_receipts SET note = 'x' WHERE id = $1", [receiptId]),
    ).rejects.toThrow(/never changes/);
    await expect(
      admin.query('DELETE FROM tenant.purchase_receipt_lines WHERE receipt_id = $1', [receiptId]),
    ).rejects.toThrow(/never changes/);
    await expect(
      admin.query(
        'UPDATE tenant.purchase_receipt_lines SET quantity_rejected = 1 WHERE receipt_id = $1',
        [receiptId],
      ),
    ).rejects.toThrow(/never changes/);
    await expect(
      admin.query(
        `INSERT INTO tenant.purchase_receipt_lines (tenant_id, receipt_id, purchase_line_id, quantity_accepted, movement_id)
         VALUES ($1, $2, $3, 4, 1)`,
        [shop.tenantId, receiptId, order.items[0]?.id],
      ),
    ).rejects.toThrow(/at most what is still to come|duplicate key/);
    const notPlaced = await draft(shop, { items: [{ variantId: lamp.variantId, quantity: 1 }] });
    await expect(
      admin.query(
        'INSERT INTO tenant.purchase_receipts (tenant_id, purchase_order_id) VALUES ($1, $2)',
        [shop.tenantId, notPlaced.id],
      ),
    ).rejects.toThrow(/placed, open purchase/);
    await expect(
      admin.query(
        `INSERT INTO tenant.stock_movements (tenant_id, product_id, variant_id, quantity_delta, reason)
         VALUES ($1, $2, $3, 1, 'purchase_receipt')`,
        [shop.tenantId, lamp.id, lamp.variantId],
      ),
    ).rejects.toThrow(/for the receipt it names/);
  });

  it("keeps another shop's purchases, items and history out of reach", async () => {
    const shop = await openShop(port, texts, 'receive-mine');
    const other = await openShop(port, texts, 'receive-theirs');
    const theirs = await product(other, 'Lamp', 0);
    const theirOrder = await placed(other, [{ variantId: theirs.variantId, quantity: 2 }]);
    const mine = await product(shop, 'Lamp', 0);
    const myOrder = await placed(shop, [{ variantId: mine.variantId, quantity: 2 }]);
    expect(
      (
        await shop.post(`/purchase-orders/${theirOrder.id}/receipts`, {
          items: [{ itemId: theirOrder.items[0]?.id, accepted: 1 }],
        })
      ).status,
    ).toBe(404);
    expect(
      (await shop.post(`/purchase-orders/${theirOrder.id}/close`, { reason: 'x' })).status,
    ).toBe(404);
    expect(
      fieldsOf(
        await shop.post(`/purchase-orders/${myOrder.id}/receipts`, {
          items: [{ itemId: theirOrder.items[0]?.id, accepted: 1 }],
        }),
      ),
    ).toEqual({ 'items.0.itemId': 'not_found' });
    expect(
      (await shop.get(`/products/${theirs.id}/variants/${theirs.variantId}/purchases`)).status,
    ).toBe(404);
    expect((await rowOf(other, theirs.id, theirs.variantId)).onHand).toBe('0.000');
  });
});
