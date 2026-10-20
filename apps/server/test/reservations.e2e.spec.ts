import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@lytronix/db';
import { ReservationStatus, StockReason } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { DAY_MS, dhakaDate } from '../src/common/time';
import type { CatalogueTransactions } from '../src/modules/catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../src/modules/catalogue/tokens';
import { BatchExpiryService } from '../src/modules/inventory/services/batch-expiry.service';
import { InventoryLedger } from '../src/modules/inventory/services/inventory-ledger';
import { ReservationExpiryService } from '../src/modules/inventory/services/reservation-expiry.service';
import { ReservationService } from '../src/modules/inventory/services/reservation.service';
import { BATCH_EXPIRY_NOTIFIER, LOW_STOCK_NOTIFIER } from '../src/modules/inventory/tokens';
import type {
  ReservationLine,
  ReservationRecord,
  Shipment,
} from '../src/modules/inventory/types/inventory';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { ExpiryCapture, LowStockCapture } from './support/inventory-notices';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 5a: stock held for orders -- reserving, shipping (consuming) and letting go (releasing), the minute
// pass that lets an unpaid order's hold run out, what expiry under a hold does, and the guards on held stock; INV-05
// under concurrency (exit criterion 2) and the inventory golden path (exit criterion 3). Reservations are a service
// Phase 4's orders call, so these tests call it directly. INV-15, INV-16, PRD-07. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_reservations_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const lowStock = new LowStockCapture();
const expiry = new ExpiryCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'reservations-e2e-otp-secret-0123456789abcdef';
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

const SYSTEM = { id: null, ip: null };
const MINUTE_MS = 60_000;
const day = (offset: number): string => dhakaDate(new Date(Date.now() + offset * DAY_MS));

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey): string {
  return translate(key, 'bn');
}

interface Product {
  id: string;
  variants: { id: string; optionIds: string[] }[];
}

interface VariantStock {
  variantId: string;
  onHand: string | null;
  reserved: string | null;
  unsellable: string | null;
  reservedExpired: string | null;
  available: string;
  state: string;
  avgCost?: string | null;
}

interface Stock {
  state: string;
  shared: (VariantStock & { onHand: string; reserved: string }) | null;
  variants: VariantStock[];
}

interface Movement {
  delta: string;
  reason: string;
  unitCost?: string | null;
  reference: { type: string; id: string } | null;
  batch: { batchCode: string | null } | null;
}

interface Batch {
  id: string;
  batchCode: string | null;
  quantity: string;
}

function inTx<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return app.get<CatalogueTransactions>(CATALOGUE_TRANSACTIONS).run(work);
}

function line(variantId: string, quantity: number): ReservationLine {
  return { orderLineId: randomUUID(), variantId, quantity: String(quantity) };
}

function reserve(
  shop: ShopClient,
  lines: ReservationLine[],
  options: { orderId?: string; awaitingPayment?: boolean; now?: Date } = {},
): Promise<ReservationRecord[]> {
  return inTx((tx) =>
    app.get(ReservationService).reserve(
      tx,
      shop.tenantId,
      {
        orderId: options.orderId ?? randomUUID(),
        awaitingPayment: options.awaitingPayment ?? false,
        lines,
      },
      options.now,
    ),
  );
}

function ship(shop: ShopClient, shipments: Shipment[]) {
  return inTx((tx) => app.get(ReservationService).consume(tx, shop.tenantId, shipments, SYSTEM));
}

function release(shop: ShopClient, ids: string[]): Promise<void> {
  return inTx((tx) => app.get(ReservationService).release(tx, shop.tenantId, ids));
}

function sell(shop: ShopClient, variantId: string, quantity: number) {
  return inTx((tx) =>
    app
      .get(InventoryLedger)
      .apply(
        tx,
        shop.tenantId,
        [{ variantId, delta: String(-quantity), reason: StockReason.Sale }],
        SYSTEM,
      ),
  );
}

async function create(shop: ShopClient, body: Record<string, unknown>): Promise<Product> {
  const result = await shop.post('/products', { basePrice: 100, ...body });
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
    variants: [{ optionIds: [], ...(openingStock > 0 ? { openingStock } : {}) }],
    ...extra,
  });
  return { product, variantId: product.variants[0]?.id ?? '' };
}

async function platformOptions(
  shop: ShopClient,
  name: string,
  values: string[],
): Promise<{ attributeId: string; ids: string[] }> {
  const rows = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const attributeId = rows.find((row) => row.name === name && row.scope === 'platform')?.id ?? '';
  const made = await shop.post(`/attributes/${attributeId}/options/batch`, { values });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { attributeId, ids: (made.body as { id: string }[]).map((option) => option.id) };
}

async function stockOf(shop: ShopClient, productId: string): Promise<Stock> {
  const result = await shop.get(`/products/${productId}/stock`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Stock;
}

async function variantStock(
  shop: ShopClient,
  productId: string,
  variantId: string,
): Promise<VariantStock> {
  const found = (await stockOf(shop, productId)).variants.find(
    (row) => row.variantId === variantId,
  );
  if (!found) throw new Error(`no variant ${variantId}`);
  return found;
}

/** CCH-08: the product's public stock state, as stored for the storefront. */
async function publicState(shop: ShopClient, productId: string): Promise<string> {
  return ((await shop.get(`/products/${productId}`)).body as { stockState: string }).stockState;
}

async function movementsOf(shop: ShopClient, productId: string, variantId: string) {
  const result = await shop.get(`/products/${productId}/variants/${variantId}/stock-history`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return (result.body as { movements: Movement[] }).movements;
}

async function batchesOf(shop: ShopClient, productId: string): Promise<Batch[]> {
  const result = await shop.get(`/products/${productId}/batches`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return (result.body as { batches: Batch[] }).batches;
}

function addStock(shop: ShopClient, productId: string, variantId: string, body: unknown) {
  return shop.post(`/products/${productId}/variants/${variantId}/stock-additions`, body);
}

/** As if the batch's last sellable day had passed. */
async function expire(batchId: string): Promise<void> {
  await admin.query('UPDATE tenant.stock_batches SET expires_on = $2 WHERE id = $1', [
    batchId,
    day(-1),
  ]);
}

async function statusOf(id: string): Promise<string> {
  const result = await admin.query<{ status: string }>(
    'SELECT status FROM tenant.stock_reservations WHERE id = $1',
    [id],
  );
  return result.rows[0]?.status ?? 'missing';
}

/**
 * INV-05, exit criteria 2 and 3: for every level of the shop, on hand is the sum of its movements, reserved the sum of
 * its active reservations, and, on a batch-tracked product, on hand the sum of its batches.
 */
async function expectLedgerAgrees(tenantId: string): Promise<void> {
  const result = await admin.query<{
    variant_id: string;
    on_hand: string;
    moved: string;
    reserved: string;
    held: string;
    batch_tracked: boolean;
    batched: string;
  }>(
    `SELECT l.variant_id, l.on_hand::text, l.reserved::text, p.batch_tracked,
       (SELECT coalesce(sum(m.quantity_delta), 0) FROM tenant.stock_movements m
        WHERE m.tenant_id = l.tenant_id AND m.variant_id = l.variant_id)::numeric(14, 3)::text AS moved,
       (SELECT coalesce(sum(r.quantity), 0) FROM tenant.stock_reservations r
        WHERE r.tenant_id = l.tenant_id AND r.variant_id = l.variant_id AND r.status = 'active')::numeric(14, 3)::text
         AS held,
       (SELECT coalesce(sum(b.quantity), 0) FROM tenant.stock_batches b
        WHERE b.tenant_id = l.tenant_id AND b.variant_id = l.variant_id)::numeric(14, 3)::text AS batched
     FROM tenant.stock_levels l
     JOIN tenant.product_variants v ON v.tenant_id = l.tenant_id AND v.id = l.variant_id
     JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
     WHERE l.tenant_id = $1`,
    [tenantId],
  );
  expect(result.rows.length).toBeGreaterThan(0);
  for (const row of result.rows) {
    expect(row.on_hand, `on hand of ${row.variant_id}`).toBe(row.moved);
    expect(row.reserved, `reserved of ${row.variant_id}`).toBe(row.held);
    if (row.batch_tracked) expect(row.on_hand, `batches of ${row.variant_id}`).toBe(row.batched);
  }
}

describeIfDatabase('holding stock for orders (INV-15, PRD-07)', () => {
  it('holds stock for the lines, nothing for made to order, and lets it go with no movement', async () => {
    const shop = await openShop(port, texts, 'hold');
    const soap = await simple(shop, 'Soap', 5, { lowStockThreshold: 3 });
    const cake = await simple(shop, 'Birthday cake', 0, { stockTracking: 'not_tracked' });
    const orderId = randomUUID();

    const held = await reserve(shop, [line(soap.variantId, 2), line(cake.variantId, 30)], {
      orderId,
    });
    // PRD-07: the made-to-order line holds nothing and is never refused.
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({
      orderId,
      productId: soap.product.id,
      variantId: soap.variantId,
      soldVariantId: soap.variantId,
      ordered: '2.000',
      packAmount: null,
      quantity: '2.000',
      status: ReservationStatus.Active,
      expiresAt: null,
    });
    expect(await variantStock(shop, soap.product.id, soap.variantId)).toMatchObject({
      onHand: '5.000',
      reserved: '2.000',
      available: '3.000',
      reservedExpired: '0.000',
      state: 'low',
    });
    // INV-08: what is held is no longer available, so the soap is now low.
    expect(lowStock.for(soap.variantId)).toHaveLength(1);
    await expectLedgerAgrees(shop.tenantId);

    await release(shop, [held[0]?.id ?? '']);
    expect(await statusOf(held[0]?.id ?? '')).toBe(ReservationStatus.Released);
    expect(await variantStock(shop, soap.product.id, soap.variantId)).toMatchObject({
      onHand: '5.000',
      reserved: '0.000',
      available: '5.000',
    });
    // Letting go moves nothing on hand: the opening stock is still the only movement.
    expect(await movementsOf(shop, soap.product.id, soap.variantId)).toHaveLength(1);
    await expectLedgerAgrees(shop.tenantId);

    // Resolved once: neither let go again nor shipped.
    await expect(release(shop, [held[0]?.id ?? ''])).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'ReservationResolved',
    });
    await expect(ship(shop, [{ reservationId: held[0]?.id ?? '' }])).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'ReservationResolved',
    });
    await expect(release(shop, [randomUUID()])).rejects.toMatchObject({
      code: 'not_found',
      messageKey: 'ReservationNotFound',
    });
  });

  it('ships a reservation whole as one sale at the cost of the moment, the serials sold to the order', async () => {
    const shop = await openShop(port, texts, 'ship');
    const soap = await simple(shop, 'Soap', 5);
    await shop.put(`/products/${soap.product.id}/variants/${soap.variantId}/cost`, { avgCost: 40 });
    const [held] = await reserve(shop, [line(soap.variantId, 2)]);
    const movements = await ship(shop, [{ reservationId: held?.id ?? '' }]);
    expect(movements).toHaveLength(1);
    expect(await statusOf(held?.id ?? '')).toBe(ReservationStatus.Consumed);
    expect((await movementsOf(shop, soap.product.id, soap.variantId))[0]).toMatchObject({
      delta: '-2.000',
      reason: 'sale',
      unitCost: '40.0000',
      reference: { type: 'reservation', id: held?.id },
    });
    expect(await variantStock(shop, soap.product.id, soap.variantId)).toMatchObject({
      onHand: '3.000',
      reserved: '0.000',
      available: '3.000',
    });
    await expectLedgerAgrees(shop.tenantId);

    // INV-14: a serial-numbered product ships with the serial of every unit, and those units are sold to the order.
    const phone = await simple(shop, 'Phone', 0, { serialTracked: true, serialFormat: 'any' });
    const added = await addStock(shop, phone.product.id, phone.variantId, {
      quantity: 2,
      serials: ['SN-A', 'SN-B'],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const orderId = randomUUID();
    const [unit] = await reserve(shop, [line(phone.variantId, 1)], { orderId });
    const reservationId = unit?.id ?? '';
    await expect(ship(shop, [{ reservationId }])).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'SerialPerUnitShipped',
    });
    await expect(ship(shop, [{ reservationId, serials: ['SN-Z'] }])).rejects.toMatchObject({
      code: 'not_found',
      messageKey: 'SerialNotFound',
    });
    // A refused shipment leaves the reservation holding its stock.
    expect(await statusOf(reservationId)).toBe(ReservationStatus.Active);
    await ship(shop, [{ reservationId, serials: ['SN-A'] }]);
    const serial = await admin.query<{
      status: string;
      sold_order_id: string | null;
      left: boolean;
    }>(
      `SELECT status, sold_order_id, left_movement_id IS NOT NULL AS left FROM tenant.serial_numbers
       WHERE tenant_id = $1 AND serial = 'SN-A'`,
      [shop.tenantId],
    );
    expect(serial.rows[0]).toEqual({ status: 'sold', sold_order_id: orderId, left: true });
    await expectLedgerAgrees(shop.tenantId);
  });

  it("holds a size's packs on the shared stock, and ships them from it (INV-24)", async () => {
    const shop = await openShop(port, texts, 'shared');
    const { attributeId, ids } = await platformOptions(shop, 'Size', ['10 ml', '100 ml']);
    const perfume = await create(shop, {
      name: 'Oud',
      stockUnit: 'ml',
      sharedStock: true,
      sharedOpeningStock: 200,
      variantAttributes: [{ attributeId, optionIds: ids }],
      variants: [
        { optionIds: [ids[0]], packAmount: 10 },
        { optionIds: [ids[1]], packAmount: 100 },
      ],
    });
    const small = perfume.variants.find((row) => row.optionIds[0] === ids[0])?.id ?? '';
    const large = perfume.variants.find((row) => row.optionIds[0] === ids[1])?.id ?? '';
    const shared = (await stockOf(shop, perfume.id)).shared;
    const holder = shared?.variantId ?? '';

    const [held] = await reserve(shop, [line(small, 3)]);
    expect(held).toMatchObject({
      variantId: holder,
      soldVariantId: small,
      ordered: '3.000',
      packAmount: '10.000',
      quantity: '30.000',
    });
    const stock = await stockOf(shop, perfume.id);
    expect(stock.shared).toMatchObject({
      onHand: '200.000',
      reserved: '30.000',
      available: '170.000',
    });
    // 170 ml left makes one whole 100 ml pack.
    expect(stock.variants.find((row) => row.variantId === large)?.available).toBe('1.000');
    await expect(reserve(shop, [line(large, 2)])).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'NotEnoughStockForOrder',
    });
    await expect(reserve(shop, [{ ...line(small, 1), quantity: '1.5' }])).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'WholePacksOnly',
    });

    await ship(shop, [{ reservationId: held?.id ?? '' }]);
    expect((await movementsOf(shop, perfume.id, holder))[0]).toMatchObject({
      delta: '-30.000',
      reason: 'sale',
    });
    expect((await stockOf(shop, perfume.id)).shared).toMatchObject({
      onHand: '170.000',
      reserved: '0.000',
    });
    await expectLedgerAgrees(shop.tenantId);
  });

  it('gives exactly one of two simultaneous reservations for the last unit, the other a conflict (INV-01)', async () => {
    const shop = await openShop(port, texts, 'last-unit');
    for (let round = 0; round < 5; round += 1) {
      const { product, variantId } = await simple(shop, `Last one ${String(round)}`, 1);
      const results = await Promise.allSettled([
        reserve(shop, [line(variantId, 1)]),
        reserve(shop, [line(variantId, 1)]),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const refused = results.find((result) => result.status === 'rejected');
      expect((refused as PromiseRejectedResult).reason).toMatchObject({
        code: 'conflict',
        messageKey: 'NotEnoughStockForOrder',
        params: { product: `Last one ${String(round)}` },
      });
      expect(await variantStock(shop, product.id, variantId)).toMatchObject({
        onHand: '1.000',
        reserved: '1.000',
        available: '0.000',
      });
      expect(await publicState(shop, product.id)).toBe('out');
    }
    await expectLedgerAgrees(shop.tenantId);
  });

  it('gives ten simultaneous orders for five units five holds and five conflicts, never below zero (INV-05)', async () => {
    const shop = await openShop(port, texts, 'rush');
    const { product, variantId } = await simple(shop, 'Rush soap', 5);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserve(shop, [line(variantId, 1)])),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'conflict' });
    }
    expect(await variantStock(shop, product.id, variantId)).toMatchObject({
      reserved: '5.000',
      available: '0.000',
    });
    await expectLedgerAgrees(shop.tenantId);
  });

  it('lets two orders for different sizes of one product hold at once, both changing its stock state', async () => {
    const shop = await openShop(port, texts, 'two-sizes');
    for (let round = 0; round < 5; round += 1) {
      const { attributeId, ids } = await platformOptions(shop, 'Size', [
        `S${String(round)}`,
        `M${String(round)}`,
      ]);
      const kurti = await create(shop, {
        name: `Kurti ${String(round)}`,
        lowStockThreshold: 0,
        variantAttributes: [{ attributeId, optionIds: ids }],
        variants: ids.map((id) => ({ optionIds: [id], openingStock: 1 })),
      });
      const results = await Promise.allSettled(
        kurti.variants.map((row) => reserve(shop, [line(row.id, 1)])),
      );
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
      // CCH-08: the public state the second writer stored saw the first writer's hold.
      expect(await publicState(shop, kurti.id)).toBe('out');
    }
    await expectLedgerAgrees(shop.tenantId);
  });

  it('holds all of an order or none: a line short of stock leaves nothing held', async () => {
    const shop = await openShop(port, texts, 'all-or-none');
    const soap = await simple(shop, 'Soap', 5);
    const comb = await simple(shop, 'Comb', 1);
    await expect(
      reserve(shop, [line(soap.variantId, 2), line(comb.variantId, 2)]),
    ).rejects.toMatchObject({ code: 'conflict', messageKey: 'NotEnoughStockForOrder' });
    expect(await variantStock(shop, soap.product.id, soap.variantId)).toMatchObject({
      reserved: '0.000',
    });
    // A sale outside a reservation never takes held units.
    await reserve(shop, [line(soap.variantId, 4)]);
    await expect(sell(shop, soap.variantId, 2)).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'NotEnoughStock',
    });
    await sell(shop, soap.variantId, 1);
    // Nor does a stock edit: 4 are held, so the stock cannot go below 4.
    const edit = await shop.put(`/products/${soap.product.id}/variants/${soap.variantId}/stock`, {
      onHand: 3,
    });
    expect(edit.status).toBe(409);
    expect(errorOf(edit).message).toBe(said('NotEnoughStock'));
    await expectLedgerAgrees(shop.tenantId);
  });
});

describeIfDatabase('an unpaid order running out of time (INV-16, D3-6)', () => {
  it('lets an unpaid hold go within a minute of its time, with no movement; a COD order never runs out', async () => {
    const shop = await openShop(port, texts, 'expiry');
    const soap = await simple(shop, 'Soap', 10);
    const now = new Date();
    const [late] = await reserve(shop, [line(soap.variantId, 2)], {
      awaitingPayment: true,
      now: new Date(now.getTime() - 31 * MINUTE_MS),
    });
    const [paying] = await reserve(shop, [line(soap.variantId, 3)], { awaitingPayment: true, now });
    const [cod] = await reserve(shop, [line(soap.variantId, 1)], { now });
    // The default 30 minutes, the setting the migration seeds.
    expect(paying?.expiresAt?.getTime()).toBe(now.getTime() + 30 * MINUTE_MS);
    expect(cod?.expiresAt).toBeNull();
    const seeded = await admin.query<{ value: unknown }>(
      "SELECT value FROM control.platform_settings WHERE key = 'reservation_expiry_minutes'",
    );
    expect(seeded.rows[0]?.value).toBe(30);

    const pass = app.get(ReservationExpiryService);
    const first = await pass.runTick(now);
    expect(first.released).toBeGreaterThanOrEqual(1);
    expect(await statusOf(late?.id ?? '')).toBe(ReservationStatus.Released);
    expect(await statusOf(paying?.id ?? '')).toBe(ReservationStatus.Active);
    expect(await statusOf(cod?.id ?? '')).toBe(ReservationStatus.Active);
    expect(await variantStock(shop, soap.product.id, soap.variantId)).toMatchObject({
      onHand: '10.000',
      reserved: '4.000',
    });
    expect(await movementsOf(shop, soap.product.id, soap.variantId)).toHaveLength(1);
    await expectLedgerAgrees(shop.tenantId);

    // Running it again changes nothing; a minute past the paying order's time lets it go too, never the COD one.
    await pass.runTick(now);
    expect(await statusOf(late?.id ?? '')).toBe(ReservationStatus.Released);
    await pass.runTick(new Date(now.getTime() + 31 * MINUTE_MS));
    expect(await statusOf(paying?.id ?? '')).toBe(ReservationStatus.Released);
    expect(await statusOf(cod?.id ?? '')).toBe(ReservationStatus.Active);
    await expectLedgerAgrees(shop.tenantId);
  });

  it('lets an order ship that pays just as its time runs out, and the pass then leaves it alone', async () => {
    const shop = await openShop(port, texts, 'paid-late');
    const soap = await simple(shop, 'Soap', 3);
    const [held] = await reserve(shop, [line(soap.variantId, 2)], {
      awaitingPayment: true,
      now: new Date(Date.now() - 31 * MINUTE_MS),
    });
    await ship(shop, [{ reservationId: held?.id ?? '' }]);
    await app.get(ReservationExpiryService).runTick(new Date());
    expect(await statusOf(held?.id ?? '')).toBe(ReservationStatus.Consumed);
    expect(await variantStock(shop, soap.product.id, soap.variantId)).toMatchObject({
      onHand: '1.000',
      reserved: '0.000',
    });
    await expectLedgerAgrees(shop.tenantId);
  });
});

describeIfDatabase('expiry under a hold (INV-13, INV-15)', () => {
  it('records the shortfall, tells the shop once, and fails only the order left uncovered', async () => {
    const shop = await openShop(port, texts, 'short');
    const { product, variantId } = await simple(shop, 'Face cream', 0, {
      batchTracked: true,
      lowStockThreshold: 0,
    });
    await addStock(shop, product.id, variantId, {
      quantity: 3,
      batch: { batchCode: 'OLD', expiresOn: day(10) },
    });
    await addStock(shop, product.id, variantId, {
      quantity: 4,
      batch: { batchCode: 'NEW', expiresOn: day(200) },
    });
    const [first] = await reserve(shop, [line(variantId, 3)]);
    const [second] = await reserve(shop, [line(variantId, 4)]);
    const old =
      (await batchesOf(shop, product.id)).find((row) => row.batchCode === 'OLD')?.id ?? '';
    await expire(old);

    // The daily pass no longer stumbles on held units: expired stays unsellable and available floors at 0.
    const daily = app.get(BatchExpiryService);
    const pass = await daily.runDaily();
    expect(pass.shortNotices).toBeGreaterThanOrEqual(1);
    expect(await variantStock(shop, product.id, variantId)).toMatchObject({
      onHand: '7.000',
      reserved: '7.000',
      unsellable: '3.000',
      reservedExpired: '3.000',
      available: '0.000',
    });
    expect(expiry.shortFor(variantId)).toHaveLength(1);
    expect(expiry.shortFor(variantId)[0]).toMatchObject({
      tenantId: shop.tenantId,
      productName: 'Face cream',
      reserved: '7.000',
      short: '3.000',
    });
    await daily.runDaily();
    expect(expiry.shortFor(variantId)).toHaveLength(1);

    // Nothing else may make it worse: no new hold, no sale outside a hold, and the expired units stay on hand while
    // held, so writing them off waits for the orders.
    await expect(reserve(shop, [line(variantId, 1)])).rejects.toMatchObject({
      messageKey: 'NotEnoughStockForOrder',
    });
    await expect(sell(shop, variantId, 1)).rejects.toMatchObject({ messageKey: 'NotEnoughStock' });
    const writeOff = await shop.post(`/products/${product.id}/batches/${old}/write-off`, {});
    expect(writeOff.status).toBe(409);
    expect(errorOf(writeOff).message).toBe(said('UnitsHeldForOrders'));

    // The first order ships from the batch that has not expired; the second is left without enough under it.
    await ship(shop, [{ reservationId: first?.id ?? '' }]);
    const sales = (await movementsOf(shop, product.id, variantId)).filter(
      (row) => row.reason === 'sale',
    );
    expect(sales.map((row) => [row.delta, row.batch?.batchCode])).toEqual([['-3.000', 'NEW']]);
    await expect(ship(shop, [{ reservationId: second?.id ?? '' }])).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'ReservedStockExpired',
    });
    expect(await statusOf(second?.id ?? '')).toBe(ReservationStatus.Active);
    await expectLedgerAgrees(shop.tenantId);

    // Once the order lets go, the expired units are written off, and the next pass resets the notice.
    await release(shop, [second?.id ?? '']);
    const writtenOff = await shop.post(`/products/${product.id}/batches/${old}/write-off`, {});
    expect(writtenOff.status, JSON.stringify(writtenOff.body)).toBe(200);
    expect(await variantStock(shop, product.id, variantId)).toMatchObject({
      onHand: '1.000',
      reserved: '0.000',
      unsellable: '0.000',
      reservedExpired: '0.000',
      available: '1.000',
    });
    await daily.runDaily();
    const flag = await admin.query<{ short_notified: boolean }>(
      'SELECT short_notified FROM tenant.stock_levels WHERE tenant_id = $1 AND variant_id = $2',
      [shop.tenantId, variantId],
    );
    expect(flag.rows[0]?.short_notified).toBe(false);
    await expectLedgerAgrees(shop.tenantId);
  });
});

describeIfDatabase('while units are held for an order (INV-15, PRD-13)', () => {
  it('refuses a switch to made to order, retiring the variant and deleting for good, but allows archiving', async () => {
    const shop = await openShop(port, texts, 'guarded');
    const { attributeId, ids } = await platformOptions(shop, 'Size', ['S', 'M']);
    const [small, medium] = ids;
    const kurti = await create(shop, {
      name: 'Kurti',
      variantAttributes: [{ attributeId, optionIds: ids }],
      variants: [
        { optionIds: [small], openingStock: 2 },
        { optionIds: [medium], openingStock: 2 },
      ],
    });
    const smallId = kurti.variants.find((row) => row.optionIds[0] === small)?.id ?? '';
    const [held] = await reserve(shop, [line(smallId, 1)]);

    const untracking = await shop.patch(`/products/${kurti.id}`, { stockTracking: 'not_tracked' });
    expect(untracking.status).toBe(409);
    expect(errorOf(untracking).message).toBe(said('UnitsHeldForOrders'));
    const retiring = await shop.put(`/products/${kurti.id}/variants`, {
      variantAttributes: [{ attributeId, optionIds: [medium] }],
    });
    expect(retiring.status).toBe(409);
    expect(errorOf(retiring).message).toBe(said('UnitsHeldForOrders'));
    const deleting = await shop.delete(`/products/${kurti.id}?hard=true`);
    expect(deleting.status).toBe(409);
    expect(errorOf(deleting).message).toBe(said('UnitsHeldForOrders'));
    // Nothing changed: still tracked, S still offered and holding its stock.
    expect(await variantStock(shop, kurti.id, smallId)).toMatchObject({
      onHand: '2.000',
      reserved: '1.000',
    });

    // The database refuses the same, whatever path a write takes.
    await expect(
      admin.query('UPDATE tenant.product_variants SET deleted_at = now() WHERE id = $1', [smallId]),
    ).rejects.toMatchObject({ constraint: 'stock_held_for_orders' });
    await expect(
      admin.query('UPDATE tenant.stock_levels SET reserved = 0 WHERE variant_id = $1', [smallId]),
    ).rejects.toMatchObject({ constraint: 'stock_levels_through_reservations' });
    await expect(
      admin.query('DELETE FROM tenant.stock_reservations WHERE id = $1', [held?.id]),
    ).rejects.toMatchObject({ constraint: 'stock_reservations_kept' });
    await expect(
      admin.query(
        "UPDATE tenant.stock_reservations SET status = 'released', resolved_at = now(), quantity = 2 WHERE id = $1",
        [held?.id],
      ),
    ).rejects.toMatchObject({ constraint: 'stock_reservations_kept' });
    // Marked shipped without its sale, the commit is refused.
    await expect(
      admin.query(
        "UPDATE tenant.stock_reservations SET status = 'consumed', resolved_at = now() WHERE id = $1",
        [held?.id],
      ),
    ).rejects.toMatchObject({ constraint: 'stock_reservations_shipped' });

    // Archiving keeps the order shippable.
    expect((await shop.delete(`/products/${kurti.id}`)).status).toBe(200);
    await ship(shop, [{ reservationId: held?.id ?? '' }]);
    await expectLedgerAgrees(shop.tenantId);
  });

  it('lets go of every held unit before the day-60 deletion erases the catalogue', async () => {
    const shop = await openShop(port, texts, 'erased');
    const soap = await simple(shop, 'Soap', 3);
    await reserve(shop, [line(soap.variantId, 2)]);
    await admin.query("UPDATE control.tenants SET state = 'archived' WHERE id = $1", [
      shop.tenantId,
    ]);
    const { InventoryEraser } = await import('../src/modules/inventory/services/inventory-eraser');
    const { CatalogueEraser } = await import('../src/modules/catalogue/services/catalogue-eraser');
    await app.get(InventoryEraser).deleteAllForTenant(shop.tenantId);
    await app.get(CatalogueEraser).deleteAllForTenant(shop.tenantId);
    const left = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenant.stock_reservations WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(left.rows[0]?.count).toBe('0');
  });
});

describeIfDatabase('the inventory golden path (exit criterion 3)', () => {
  it('cosmetics, shades, Add stock, a purchase short with rejects, reserve, ship, release, run out, count', async () => {
    const shop = await openShop(port, texts, 'golden');
    // The cosmetics preset: batch-tracked by default.
    expect((await shop.put('/business-type', { businessType: 'cosmetics' })).status).toBe(200);
    const defaults = (await shop.get('/product-defaults')).body as {
      batchTracked: boolean;
      stockUnit: string;
    };
    expect(defaults).toMatchObject({ batchTracked: true, stockUnit: 'piece' });
    const { attributeId, ids } = await platformOptions(shop, 'Shade', ['Ruby', 'Coral']);
    const lipstick = await create(shop, {
      name: 'Matte lipstick',
      batchTracked: defaults.batchTracked,
      stockUnit: defaults.stockUnit,
      variantAttributes: [{ attributeId, optionIds: ids }],
      variants: [{ optionIds: [ids[0]] }, { optionIds: [ids[1]] }],
    });
    const ruby = lipstick.variants.find((row) => row.optionIds[0] === ids[0])?.id ?? '';
    const rubyOf = () => variantStock(shop, lipstick.id, ruby);
    const batchQuantities = async (): Promise<Record<string, string>> =>
      Object.fromEntries(
        (await batchesOf(shop, lipstick.id)).map((row) => [row.batchCode ?? '', row.quantity]),
      );

    // Quick Add stock, with its cost and expiry.
    const added = await addStock(shop, lipstick.id, ruby, {
      quantity: 10,
      unitCost: 200,
      batch: { batchCode: 'R1', expiresOn: day(60) },
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(await rubyOf()).toMatchObject({ onHand: '10.000', avgCost: '200.0000' });
    await expectLedgerAgrees(shop.tenantId);

    // A planned purchase of 20 at 260, received short: 15 accepted, 2 rejected, then closed.
    const drafted = await shop.post('/purchase-orders', {
      supplierName: 'Glow Traders',
      items: [{ variantId: ruby, quantity: 20, unitCost: 260 }],
    });
    expect(drafted.status, JSON.stringify(drafted.body)).toBe(201);
    const purchase = drafted.body as { id: string };
    expect((await shop.post(`/purchase-orders/${purchase.id}/place`, {})).status).toBe(200);
    const placed = (await shop.get(`/purchase-orders/${purchase.id}`)).body as {
      items: { id: string }[];
    };
    const received = await shop.post(`/purchase-orders/${purchase.id}/receipts`, {
      items: [
        {
          itemId: placed.items[0]?.id,
          accepted: 15,
          rejected: 2,
          rejectReason: 'Broken caps',
          batch: { batchCode: 'R2', expiresOn: day(120) },
        },
      ],
    });
    expect(received.status, JSON.stringify(received.body)).toBe(201);
    expect(received.body).toMatchObject({ status: 'partially_received' });
    const closed = await shop.post(`/purchase-orders/${purchase.id}/close`, {
      reason: 'Supplier has no more',
    });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    // (10 x 200 + 15 x 260) / 25 = 236; the rejects never touch it.
    expect(await rubyOf()).toMatchObject({ onHand: '25.000', avgCost: '236.0000' });
    expect(await batchQuantities()).toEqual({ R1: '10.000', R2: '15.000' });
    await expectLedgerAgrees(shop.tenantId);

    // Reserve 12 for a cash-on-delivery order, then ship it: earliest expiry first.
    const [cod] = await reserve(shop, [line(ruby, 12)]);
    expect(await rubyOf()).toMatchObject({
      onHand: '25.000',
      reserved: '12.000',
      available: '13.000',
    });
    await expectLedgerAgrees(shop.tenantId);
    await ship(shop, [{ reservationId: cod?.id ?? '' }]);
    const sales = (await movementsOf(shop, lipstick.id, ruby)).filter(
      (row) => row.reason === 'sale',
    );
    expect(sales.map((row) => [row.batch?.batchCode, row.delta, row.unitCost])).toEqual(
      expect.arrayContaining([
        ['R1', '-10.000', '236.0000'],
        ['R2', '-2.000', '236.0000'],
      ]),
    );
    expect(await rubyOf()).toMatchObject({
      onHand: '13.000',
      reserved: '0.000',
      avgCost: '236.0000',
    });
    expect(await batchQuantities()).toMatchObject({ R2: '13.000' });
    await expectLedgerAgrees(shop.tenantId);

    // Reserve 3 and let them go: nothing moves.
    const before = (await movementsOf(shop, lipstick.id, ruby)).length;
    const [cancelled] = await reserve(shop, [line(ruby, 3)]);
    await release(shop, [cancelled?.id ?? '']);
    expect(await rubyOf()).toMatchObject({ onHand: '13.000', reserved: '0.000' });
    await expectLedgerAgrees(shop.tenantId);

    // An unpaid order's hold runs out and the minute pass lets it go: nothing moves.
    const [unpaid] = await reserve(shop, [line(ruby, 2)], {
      awaitingPayment: true,
      now: new Date(Date.now() - 31 * MINUTE_MS),
    });
    expect(await rubyOf()).toMatchObject({ reserved: '2.000', available: '11.000' });
    await app.get(ReservationExpiryService).runTick(new Date());
    expect(await statusOf(unpaid?.id ?? '')).toBe(ReservationStatus.Released);
    expect(await rubyOf()).toMatchObject({ onHand: '13.000', reserved: '0.000' });
    expect(await movementsOf(shop, lipstick.id, ruby)).toHaveLength(before);
    await expectLedgerAgrees(shop.tenantId);

    // A stock check finds one lipstick missing: 1 x 236 lost.
    const check = await shop.post('/stock-checks', { lines: [{ variantId: ruby, counted: 12 }] });
    expect(check.status, JSON.stringify(check.body)).toBe(201);
    expect((check.body as { totals: Record<string, unknown> }).totals).toMatchObject({
      valueLost: '236.00',
      valueGained: '0.00',
    });
    expect(await rubyOf()).toMatchObject({ onHand: '12.000', avgCost: '236.0000' });
    expect(await batchQuantities()).toMatchObject({ R2: '12.000' });
    await expectLedgerAgrees(shop.tenantId);
  });
});
