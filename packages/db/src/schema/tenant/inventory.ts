import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  enumTuple,
  SERIAL_MAX_LENGTH,
  SerialStatus,
  StockReason,
  STOCK_BATCH_CODE_MAX_LENGTH,
  STOCK_NOTE_MAX_LENGTH,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { productVariants } from './catalogue';

// DATABASE-SCHEMA §3.2 (inventory, INV). Quantities are numeric(14,3); a trigger refuses a fraction for a product whose
// stock unit is not measured (UOM-03). Both tables sit behind the tenant_isolation policy.

export const stockReason = tenant.enum('stock_reason', enumTuple(Object.values(StockReason)));
export const serialStatus = tenant.enum('serial_status', enumTuple(Object.values(SerialStatus)));

// INV-01: one row per tracked variant that has ever held stock. Its on-hand quantity changes only through a stock
// movement: a trigger on stock_movements keeps it, and refuses any other change. None of the three may go below
// zero, and nor may what is available, so stock can never be oversold.
export const stockLevels = tenant.table(
  'stock_levels',
  {
    tenantId: uuid('tenant_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    onHand: numeric('on_hand', { precision: 14, scale: 3 }).notNull().default('0'),
    // INV-15 (Slice 5): held by order lines.
    reserved: numeric('reserved', { precision: 14, scale: 3 }).notNull().default('0'),
    // INV-13 (Slice 3): expired, not yet written off.
    unsellable: numeric('unsellable', { precision: 14, scale: 3 }).notNull().default('0'),
    available: numeric('available', { precision: 14, scale: 3 }).generatedAlwaysAs(
      sql`"on_hand" - "reserved" - "unsellable"`,
    ),
    // INV-08: set when available falls to or below the low-stock threshold and the notice goes out; cleared when it
    // rises above, so each crossing notifies once.
    lowNotified: boolean('low_notified').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'stock_levels_pkey', columns: [t.tenantId, t.variantId] }),
    foreignKey({
      name: 'stock_levels_variant_fk',
      columns: [t.tenantId, t.variantId],
      foreignColumns: [productVariants.tenantId, productVariants.id],
    }).onDelete('cascade'),
    check('stock_levels_on_hand_check', sql`${t.onHand} >= 0`),
    check('stock_levels_reserved_check', sql`${t.reserved} >= 0`),
    check('stock_levels_unsellable_check', sql`${t.unsellable} >= 0`),
    check('stock_levels_available_check', sql`${t.onHand} - ${t.reserved} - ${t.unsellable} >= 0`),
  ],
);

// INV-03: the append-only ledger. Every change to on-hand stock is one row; the trigger fills on_hand_after from the
// level it updates. Product and variant are held by value, not by key: a hard-deleted product's movements stay, so
// cost of goods sold and losses never change after the fact (PRD-13, INV-18). An update is refused for every role,
// and a delete except the day-60 deletion of a lapsed shop's data (LIF-19).
export const stockMovements = tenant.table(
  'stock_movements',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    quantityDelta: numeric('quantity_delta', { precision: 14, scale: 3 }).notNull(),
    onHandAfter: numeric('on_hand_after', { precision: 14, scale: 3 }).notNull().default('0'),
    reason: stockReason('reason').notNull(),
    // INV-12: on a batch-tracked product, the one batch this movement moved (held by value, like the variant); null
    // otherwise. A change spanning batches is one movement per batch.
    batchId: uuid('batch_id'),
    // INV-11: the unit cost when stock left; null is unknown, never zero.
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    actorUserId: uuid('actor_user_id'),
    note: varchar('note', { length: STOCK_NOTE_MAX_LENGTH }),
    createdAt: createdAt(),
  },
  (t) => [
    check('stock_movements_delta_check', sql`${t.quantityDelta} <> 0`),
    check('stock_movements_on_hand_after_check', sql`${t.onHandAfter} >= 0`),
    check('stock_movements_unit_cost_check', sql`${t.unitCost} >= 0`),
    index('stock_movements_variant_idx').on(t.tenantId, t.variantId, t.id.desc()),
    index('stock_movements_tenant_created_idx').on(t.tenantId, t.createdAt),
  ],
);

// INV-12, INV-13: a variant's stock, batch by batch, on a batch-tracked product (on a product sharing its stock, the
// stock holder's). A batch's quantity is its opening quantity plus the sum of its own movements, and a variant's on
// hand is the sum of its open batches; the movement trigger keeps both, and a quantity changes no other way. The
// opening quantity is non-zero only for the "no expiry" batch made when batch tracking is turned on over stock already
// held. Closed when batch tracking is turned off, kept for its history.
export const stockBatches = tenant.table(
  'stock_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    batchCode: varchar('batch_code', { length: STOCK_BATCH_CODE_MAX_LENGTH }),
    // The batch's last sellable day, in Asia/Dhaka; null never expires and is picked last.
    expiresOn: date('expires_on', { mode: 'string' }),
    // INV-22: the variant's one batch for stock with no code and no expiry.
    isDefault: boolean('is_default').notNull().default(false),
    openingQuantity: numeric('opening_quantity', { precision: 14, scale: 3 })
      .notNull()
      .default('0'),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('0'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    // INV-13: set when the batch's one expiry notice went out.
    expiryNotifiedAt: timestamp('expiry_notified_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    unique('stock_batches_tenant_id_key').on(t.tenantId, t.id),
    foreignKey({
      name: 'stock_batches_variant_fk',
      columns: [t.tenantId, t.variantId],
      foreignColumns: [productVariants.tenantId, productVariants.id],
    }).onDelete('cascade'),
    check('stock_batches_quantity_check', sql`${t.quantity} >= 0`),
    check('stock_batches_opening_quantity_check', sql`${t.openingQuantity} >= 0`),
    check(
      'stock_batches_default_check',
      sql`NOT ${t.isDefault} OR (${t.batchCode} IS NULL AND ${t.expiresOn} IS NULL)`,
    ),
    uniqueIndex('stock_batches_default_idx')
      .on(t.tenantId, t.variantId)
      .where(sql`${t.isDefault} AND ${t.closedAt} IS NULL`),
    uniqueIndex('stock_batches_code_idx')
      .on(t.tenantId, t.variantId, t.batchCode)
      .where(sql`${t.batchCode} IS NOT NULL AND ${t.closedAt} IS NULL`),
    index('stock_batches_pick_idx')
      .on(t.tenantId, t.variantId, t.expiresOn, t.receivedAt)
      .where(sql`${t.closedAt} IS NULL`),
    index('stock_batches_expiry_idx')
      .on(t.tenantId, t.expiresOn)
      .where(sql`${t.closedAt} IS NULL AND ${t.expiresOn} IS NOT NULL`),
  ],
);

// INV-14: one serial-numbered unit (an IMEI, say). A variant never holds more serials than units; a unit may lack one
// for now (added later). A serial is unique within the shop among the units it holds (in stock or reserved); one that
// was sold or written off may come back as a new unit (a trade-in, a repair), as a row of its own. A unit's row is
// history once it has left: never changed again.
export const serialNumbers = tenant.table(
  'serial_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    serial: varchar('serial', { length: SERIAL_MAX_LENGTH }).notNull(),
    status: serialStatus('status').notNull().default(SerialStatus.InStock),
    // The movement that brought the unit in; null for a serial added later to a unit already held.
    receivedMovementId: bigint('received_movement_id', { mode: 'number' }),
    // The movement it left by: a write-off now, a sale in Phase 4.
    leftMovementId: bigint('left_movement_id', { mode: 'number' }),
    soldOrderId: uuid('sold_order_id'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('serial_numbers_tenant_id_key').on(t.tenantId, t.id),
    foreignKey({
      name: 'serial_numbers_variant_fk',
      columns: [t.tenantId, t.variantId],
      foreignColumns: [productVariants.tenantId, productVariants.id],
    }).onDelete('cascade'),
    uniqueIndex('serial_numbers_held_idx')
      .on(t.tenantId, t.serial)
      .where(sql`${t.status} IN ('in_stock', 'reserved')`),
    index('serial_numbers_variant_idx').on(t.tenantId, t.variantId, t.status),
  ],
);

// INV-07: one stock check, the counts it recorded, and the recount movement behind each difference. A check is a
// record of what was counted: never changed, deleted only with the rest of a lapsed shop's data (LIF-19).
export const stockChecks = tenant.table(
  'stock_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    note: varchar('note', { length: STOCK_NOTE_MAX_LENGTH }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('stock_checks_tenant_id_key').on(t.tenantId, t.id),
    index('stock_checks_tenant_created_idx').on(t.tenantId, t.createdAt.desc(), t.id.desc()),
  ],
);

// INV-07: what one variant held when it was counted, what was counted, and its average cost at that moment (null is
// unknown), so the check reports the value gained or lost however the cost moves later. The variant and product are
// held by value, like a movement's, so a check outlives a product deleted for good (PRD-13).
export const stockCheckLines = tenant.table(
  'stock_check_lines',
  {
    // A check may count several batches of one variant, so a line has its own key; the migration keeps a variant (or
    // one of its batches) to one line per check with a unique index.
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    checkId: uuid('check_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    // INV-12: the batch counted; null for a variant counted as a whole. Held by value.
    batchId: uuid('batch_id'),
    expected: numeric('expected', { precision: 14, scale: 3 }).notNull(),
    counted: numeric('counted', { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }),
    // The recount movement recording the difference; null when the count matched.
    movementId: bigint('movement_id', { mode: 'number' }),
  },
  (t) => [
    foreignKey({
      name: 'stock_check_lines_check_fk',
      columns: [t.tenantId, t.checkId],
      foreignColumns: [stockChecks.tenantId, stockChecks.id],
    }).onDelete('cascade'),
    check('stock_check_lines_expected_check', sql`${t.expected} >= 0`),
    check('stock_check_lines_counted_check', sql`${t.counted} >= 0`),
  ],
);

export type SelectStockLevel = typeof stockLevels.$inferSelect;
export type SelectStockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = typeof stockMovements.$inferInsert;
export type SelectSerialNumber = typeof serialNumbers.$inferSelect;
export type SelectStockBatch = typeof stockBatches.$inferSelect;
export type InsertStockBatch = typeof stockBatches.$inferInsert;
export type SelectStockCheck = typeof stockChecks.$inferSelect;
export type SelectStockCheckLine = typeof stockCheckLines.$inferSelect;
export type InsertStockCheckLine = typeof stockCheckLines.$inferInsert;
