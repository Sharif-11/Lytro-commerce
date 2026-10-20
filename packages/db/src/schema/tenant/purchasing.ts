import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  enumTuple,
  PURCHASE_NOTES_MAX_LENGTH,
  PurchaseStatus,
  SUPPLIER_ADDRESS_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTES_MAX_LENGTH,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

// DATABASE-SCHEMA §3.2 (purchasing, PUR). Every table sits behind the tenant_isolation policy. Quantities are
// numeric(14,3) in the product's stock unit, whole unless the unit is measured (UOM-03, a trigger).

export const purchaseStatus = tenant.enum(
  'purchase_status',
  enumTuple(Object.values(PurchaseStatus)),
);

// PUR-01: who the shop buys from. Archived rather than deleted, so a past purchase still shows its supplier's name; the
// name is unique among the live ones, ignoring case, so a typed name finds the supplier it means.
export const suppliers = tenant.table(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: SUPPLIER_NAME_MAX_LENGTH }).notNull(),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 254 }),
    address: varchar('address', { length: SUPPLIER_ADDRESS_MAX_LENGTH }),
    notes: varchar('notes', { length: SUPPLIER_NOTES_MAX_LENGTH }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('suppliers_tenant_id_key').on(t.tenantId, t.id),
    uniqueIndex('suppliers_live_name_idx')
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

// PUR-03: the last purchase number a shop gave, one row per shop, locked by the statement that takes the next one, so
// numbers are consecutive with no gap or repeat (the same locked-row idea as DAT-07's invoice numbers).
export const purchaseCounters = tenant.table('purchase_counters', {
  tenantId: uuid('tenant_id').primaryKey(),
  lastNumber: integer('last_number').notNull().default(0),
});

// PUR-02: a purchase from a supplier (optional). A draft has no number and may be deleted; placing it gives it the next
// number (PUR-03), which then never changes, and a purchase never goes back to being a draft.
export const purchaseOrders = tenant.table(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    number: integer('number'),
    supplierId: uuid('supplier_id'),
    status: purchaseStatus('status').notNull().default(PurchaseStatus.Draft),
    expectedOn: date('expected_on', { mode: 'string' }),
    notes: varchar('notes', { length: PURCHASE_NOTES_MAX_LENGTH }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // When it was placed with the supplier; null while a draft.
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
  },
  (t) => [
    unique('purchase_orders_tenant_id_key').on(t.tenantId, t.id),
    unique('purchase_orders_tenant_number_key').on(t.tenantId, t.number),
    foreignKey({
      name: 'purchase_orders_supplier_fk',
      columns: [t.tenantId, t.supplierId],
      foreignColumns: [suppliers.tenantId, suppliers.id],
    }),
    check(
      'purchase_orders_number_check',
      sql`(${t.status} = 'draft') = (${t.number} IS NULL) AND (${t.number} IS NULL) = (${t.orderedAt} IS NULL)`,
    ),
    check('purchase_orders_number_positive_check', sql`${t.number} > 0`),
    index('purchase_orders_tenant_created_idx').on(t.tenantId, t.createdAt.desc(), t.id.desc()),
    index('purchase_orders_supplier_idx').on(t.tenantId, t.supplierId),
  ],
);

// PUR-02, PUR-05: one variant on a purchase, how much was ordered and how much has been received. The variant and
// product are held by value, like a stock movement's, so a purchase outlives a product deleted for good (PRD-13); a
// trigger checks them when the line is written. Incoming stock is what is ordered and not yet received on a placed,
// open purchase, and is never part of the stock held.
export const purchaseOrderLines = tenant.table(
  'purchase_order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    purchaseOrderId: uuid('purchase_order_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    // Where the line sits on the purchase, as it was entered.
    position: integer('position').notNull(),
    quantityOrdered: numeric('quantity_ordered', { precision: 14, scale: 3 }).notNull(),
    quantityReceived: numeric('quantity_received', { precision: 14, scale: 3 })
      .notNull()
      .default('0'),
    // In taka; null is not known yet. Never public (PRD-09).
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }),
  },
  (t) => [
    unique('purchase_order_lines_tenant_id_key').on(t.tenantId, t.id),
    unique('purchase_order_lines_variant_key').on(t.purchaseOrderId, t.variantId),
    foreignKey({
      name: 'purchase_order_lines_order_fk',
      columns: [t.tenantId, t.purchaseOrderId],
      foreignColumns: [purchaseOrders.tenantId, purchaseOrders.id],
    }).onDelete('cascade'),
    check('purchase_order_lines_ordered_check', sql`${t.quantityOrdered} > 0`),
    check('purchase_order_lines_received_check', sql`${t.quantityReceived} >= 0`),
    check('purchase_order_lines_unit_cost_check', sql`${t.unitCost} >= 0`),
    index('purchase_order_lines_variant_idx').on(t.tenantId, t.variantId),
  ],
);

export type SelectSupplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;
export type SelectPurchaseOrder = typeof purchaseOrders.$inferSelect;
export type SelectPurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type InsertPurchaseOrderLine = typeof purchaseOrderLines.$inferInsert;
