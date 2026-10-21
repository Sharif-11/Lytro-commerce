import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CATEGORY_NAME_MAX_LENGTH,
  DeliveryMode,
  enumTuple,
  PaymentPolicy,
  PRODUCT_NAME_MAX_LENGTH,
  SerialFormat,
  StockState,
  StockTracking,
  StockUnit,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

// DATABASE-SCHEMA §3.2 (catalogue). Every table carries tenant_id behind the tenant_isolation policy, and
// same-tenant references use composite (tenant_id, id) keys (DAT-02). The media, stock and combo columns of the
// design arrive with the slices that use them (Slices 2 and 6, Phase 4).

export const stockUnit = tenant.enum('stock_unit', enumTuple(Object.values(StockUnit)));
export const stockTracking = tenant.enum('stock_tracking', enumTuple(Object.values(StockTracking)));
export const stockState = tenant.enum('stock_state', enumTuple(Object.values(StockState)));
export const deliveryMode = tenant.enum('delivery_mode', enumTuple(Object.values(DeliveryMode)));
export const serialFormat = tenant.enum('serial_format', enumTuple(Object.values(SerialFormat)));
export const paymentPolicy = tenant.enum('payment_policy', enumTuple(Object.values(PaymentPolicy)));

// CCH-02, INV-19: bumped in the same transaction as any write that changes what the public catalogue shows.
export const catalogueState = tenant.table('catalogue_state', {
  tenantId: uuid('tenant_id').primaryKey(),
  version: bigint('version', { mode: 'number' }).notNull().default(1),
});

// PRD-03: a tree up to four levels deep. "Uncategorized" is not a row: it is the products filed in none.
export const categories = tenant.table(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    parentId: uuid('parent_id'),
    name: varchar('name', { length: CATEGORY_NAME_MAX_LENGTH }).notNull(),
    slug: text('slug').notNull(),
    depth: smallint('depth').notNull(),
    // PST-06: the shop type (a control.business_type_presets key, held by value) its products behave like; null
    // follows the nearest ancestor's, and with none the shop's own type.
    behavesLike: text('behaves_like'),
    // MED-03: an optional banner, a ready image of the shop's; deleting the image clears it.
    imageId: uuid('image_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    visible: boolean('visible').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('categories_tenant_slug_key').on(t.tenantId, t.slug),
    unique('categories_tenant_id_key').on(t.tenantId, t.id),
    foreignKey({
      name: 'categories_parent_fk',
      columns: [t.tenantId, t.parentId],
      foreignColumns: [t.tenantId, t.id],
    }),
    check('categories_depth_check', sql`${t.depth} BETWEEN 1 AND 4`),
    index('categories_tenant_parent_idx').on(t.tenantId, t.parentId, t.sortOrder),
  ],
);

export const products = tenant.table(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: PRODUCT_NAME_MAX_LENGTH }).notNull(),
    // LND-04: set at creation from the name and never follows a rename.
    slug: text('slug').notNull(),
    description: text('description'),
    basePrice: numeric('base_price', { precision: 10, scale: 2 }).notNull(),
    stockUnit: stockUnit('stock_unit').notNull().default(StockUnit.Piece),
    stockTracking: stockTracking('stock_tracking').notNull().default(StockTracking.Tracked),
    batchTracked: boolean('batch_tracked').notNull().default(false),
    serialTracked: boolean('serial_tracked').notNull().default(false),
    // INV-23: what its serials look like: an IMEI checked for its check digit, or any code.
    serialFormat: serialFormat('serial_format').notNull().default(SerialFormat.Any),
    // INV-24: the variants draw on one stock, held by the product's stock-holder variant, each using its pack amount.
    sharedStock: boolean('shared_stock').notNull().default(false),
    lowStockThreshold: numeric('low_stock_threshold', { precision: 14, scale: 3 })
      .notNull()
      .default('5'),
    // DLV-03: an optional override; null means the order's zone charge.
    deliveryCharge: numeric('delivery_charge', { precision: 10, scale: 2 }),
    // PRD-16: with no weight, Adjustable is unavailable and the mode is read as Default.
    weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
    deliveryMode: deliveryMode('delivery_mode').notNull().default(DeliveryMode.Default),
    // PRD-08: null follows the shop's default policy.
    paymentPolicy: paymentPolicy('payment_policy'),
    advanceAmount: numeric('advance_amount', { precision: 10, scale: 2 }),
    primaryCategoryId: uuid('primary_category_id'),
    // PRD-11: its one video, a ready video of the shop's; deleting the video clears it.
    videoId: uuid('video_id'),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    // CCH-11: kept in step with the variants in the same transaction, for list pages.
    minPrice: numeric('min_price', { precision: 10, scale: 2 }),
    maxPrice: numeric('max_price', { precision: 10, scale: 2 }),
    stockState: stockState('stock_state').notNull().default(StockState.Out),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // PRD-13: archived. Still counted by nothing (PRD-04) and listed nowhere, but queryable.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('products_tenant_slug_key').on(t.tenantId, t.slug),
    unique('products_tenant_id_key').on(t.tenantId, t.id),
    foreignKey({
      name: 'products_primary_category_fk',
      columns: [t.tenantId, t.primaryCategoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }),
    check('products_base_price_check', sql`${t.basePrice} >= 0`),
    check('products_low_stock_check', sql`${t.lowStockThreshold} >= 0`),
    check('products_delivery_charge_check', sql`${t.deliveryCharge} >= 0`),
    check('products_weight_check', sql`${t.weightKg} > 0`),
    check(
      'products_tracking_check',
      sql`NOT (${t.stockTracking} = 'not_tracked' AND (${t.batchTracked} OR ${t.serialTracked}))`,
    ),
    check('products_batch_serial_check', sql`NOT (${t.batchTracked} AND ${t.serialTracked})`),
    // INV-24: shared stock is counted stock, and never serial-numbered.
    // INV-14: a serial is one per unit, so a serial-numbered product is counted in whole units.
    check(
      'products_serial_units_check',
      sql`NOT (${t.serialTracked} AND ${t.stockUnit} IN ('kg', 'g', 'liter', 'ml'))`,
    ),
    check(
      'products_shared_stock_check',
      sql`NOT (${t.sharedStock} AND (${t.stockTracking} = 'not_tracked' OR ${t.serialTracked}))`,
    ),
    check(
      'products_advance_check',
      sql`CASE WHEN ${t.paymentPolicy} = 'partial_advance' THEN ${t.advanceAmount} IS NOT NULL AND ${t.advanceAmount} >= 0 ELSE ${t.advanceAmount} IS NULL END`,
    ),
    index('products_tenant_category_idx')
      .on(t.tenantId, t.primaryCategoryId, t.sortOrder)
      .where(sql`${t.deletedAt} IS NULL`),
    index('products_tenant_created_idx')
      .on(t.tenantId, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

// PRD-15: every category a product is filed under. Which one is primary is products.primary_category_id.
export const productCategories = tenant.table(
  'product_categories',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    categoryId: uuid('category_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.productId, t.categoryId] }),
    foreignKey({
      name: 'product_categories_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_categories_category_fk',
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }),
    index('product_categories_category_idx').on(t.tenantId, t.categoryId),
  ],
);

// ATR-04, ATL-04: one row per variant. combination_key is the sorted "attributeId=optionId" pairs joined by "&"
// ('' for a product's one default variant), unique within the product, so a duplicate combination is refused by
// the database (ATR-06). A combination no longer offered is retired (deleted_at) and comes back if offered again.
export const productVariants = tenant.table(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    combinationKey: text('combination_key').notNull().default(''),
    sku: text('sku'),
    barcode: text('barcode'),
    // ATR-05, ATR-13: overrides; null means the product's own value.
    price: numeric('price', { precision: 10, scale: 2 }),
    weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
    deliveryCharge: numeric('delivery_charge', { precision: 10, scale: 2 }),
    deliveryMode: deliveryMode('delivery_mode'),
    // INV-10: the weighted average unit cost (by hand until a purchase receipt sets it); null is unknown. Never in a
    // public response.
    avgCost: numeric('avg_cost', { precision: 12, scale: 4 }),
    // INV-24: on a product with shared stock, how much of it one unit sold uses (6 for a 6 ml decant); null otherwise.
    packAmount: numeric('pack_amount', { precision: 14, scale: 3 }),
    // INV-24: the one hidden variant (combination key STOCK_HOLDER_KEY) that holds a shared stock. Never sold, never
    // listed with the product's variants, never counted against the variant limit.
    isStockHolder: boolean('is_stock_holder').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('product_variants_tenant_id_key').on(t.tenantId, t.id),
    unique('product_variants_tenant_product_id_key').on(t.tenantId, t.productId, t.id),
    unique('product_variants_product_combination_key').on(t.productId, t.combinationKey),
    foreignKey({
      name: 'product_variants_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    uniqueIndex('product_variants_tenant_sku_idx')
      .on(t.tenantId, t.sku)
      .where(sql`${t.sku} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    check('product_variants_price_check', sql`${t.price} >= 0`),
    check('product_variants_weight_check', sql`${t.weightKg} > 0`),
    check('product_variants_delivery_charge_check', sql`${t.deliveryCharge} >= 0`),
    check('product_variants_avg_cost_check', sql`${t.avgCost} >= 0`),
    check('product_variants_pack_amount_check', sql`${t.packAmount} > 0`),
    check(
      'product_variants_stock_holder_check',
      sql`NOT ${t.isStockHolder} OR (${t.combinationKey} = '#stock' AND ${t.packAmount} IS NULL)`,
    ),
  ],
);

// LND-04: an old slug keeps resolving to its product after a deliberate change, and no other product may take it.
export const productSlugRedirects = tenant.table(
  'product_slug_redirects',
  {
    tenantId: uuid('tenant_id').notNull(),
    oldSlug: text('old_slug').notNull(),
    productId: uuid('product_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'product_slug_redirects_pkey', columns: [t.tenantId, t.oldSlug] }),
    foreignKey({
      name: 'product_slug_redirects_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
  ],
);

// PRD-17: one chart per product or per category, either a table of short text or an uploaded image (MED-03), never
// both. A product without its own uses its primary category's. Deleting an image chart's image removes the chart.
export const sizeCharts = tenant.table(
  'size_charts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id'),
    categoryId: uuid('category_id'),
    tableRows: jsonb('table_rows').$type<string[][]>(),
    imageId: uuid('image_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'size_charts_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'size_charts_category_fk',
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }).onDelete('cascade'),
    check('size_charts_owner_check', sql`(${t.productId} IS NULL) <> (${t.categoryId} IS NULL)`),
    check('size_charts_content_check', sql`(${t.imageId} IS NULL) <> (${t.tableRows} IS NULL)`),
    uniqueIndex('size_charts_product_idx')
      .on(t.tenantId, t.productId)
      .where(sql`${t.productId} IS NOT NULL`),
    uniqueIndex('size_charts_category_idx')
      .on(t.tenantId, t.categoryId)
      .where(sql`${t.categoryId} IS NOT NULL`),
  ],
);

export type SelectCategory = typeof categories.$inferSelect;
export type SelectProduct = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type SelectProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;
export type SelectSizeChart = typeof sizeCharts.$inferSelect;
