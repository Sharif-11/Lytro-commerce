import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
// D3-9. Runs only when DATABASE_TEST_ADMIN_URL is set.
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

    // A delivery (Slice 4b receives it; here it is written directly) freezes the items and the supplier.
    await admin.query(
      'UPDATE tenant.purchase_order_lines SET quantity_received = 3 WHERE purchase_order_id = $1',
      [made.id],
    );
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

    await admin.query(
      'UPDATE tenant.purchase_order_lines SET quantity_received = 8 WHERE purchase_order_id = $1',
      [made.id],
    );
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
    await admin.query(
      'UPDATE tenant.purchase_order_lines SET quantity_received = 1 WHERE purchase_order_id = $1',
      [placed.id],
    );
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
