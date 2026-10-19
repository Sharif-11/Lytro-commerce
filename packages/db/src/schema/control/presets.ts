import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, numeric, text, uuid } from 'drizzle-orm/pg-core';
import { StockUnit } from '@lytronix/validators';
import { control } from '../shared';
import { stockUnit } from '../tenant/catalogue';

// PST-01, PST-02, PST-04: the shop types, and the defaults and suggestions each gives a new product. Platform
// data the operator edits without a deploy; a shop's choice is control.tenants.business_type. Defaults only:
// nothing here ever restricts what a product may use, and changing it never alters an existing product (PST-03).
export const businessTypePresets = control.table('business_type_presets', {
  key: text('key').primaryKey(),
  labelBn: text('label_bn').notNull(),
  labelEn: text('label_en').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  defaultStockUnit: stockUnit('default_stock_unit').notNull().default(StockUnit.Piece),
  defaultBatch: boolean('default_batch').notNull().default(false),
  defaultSerial: boolean('default_serial').notNull().default(false),
  defaultNotTracked: boolean('default_not_tracked').notNull().default(false),
  defaultLowStock: numeric('default_low_stock', { precision: 14, scale: 3 }).notNull().default('5'),
  // Platform attribute rows (tenant.attributes with no tenant) suggested in this order (ATR-02).
  suggestedAttributeIds: uuid('suggested_attribute_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  suggestedCategories: jsonb('suggested_categories').$type<string[]>().notNull().default([]),
});

export type SelectBusinessTypePreset = typeof businessTypePresets.$inferSelect;
