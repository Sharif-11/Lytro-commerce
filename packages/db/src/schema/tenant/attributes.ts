import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
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
  ATTRIBUTE_NAME_MAX_LENGTH,
  AttributeDataType,
  AttributeRole,
  enumTuple,
  OPTION_SET_NAME_MAX_LENGTH,
  OPTION_VALUE_MAX_LENGTH,
  UnitKind,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { categories, productVariants, products } from './catalogue';

// DATABASE-SCHEMA §3.2 (attributes, ATL). Attributes and their options each carry a scope: tenant_id NULL is the
// platform library every shop reads, a tenant id is that shop's own. Their policies let a shop read both and write
// only its own; a trigger stops any row from pointing at another shop's attribute or option.

export const attributeDataType = tenant.enum(
  'attribute_data_type',
  enumTuple(Object.values(AttributeDataType)),
);
export const unitKind = tenant.enum('unit_kind', enumTuple(Object.values(UnitKind)));
export const attributeRole = tenant.enum('attribute_role', enumTuple(Object.values(AttributeRole)));

// ATL-01: name, type, and for a number with a unit, what it measures (UOM-02). The type never changes.
export const attributes = tenant.table(
  'attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: varchar('name', { length: ATTRIBUTE_NAME_MAX_LENGTH }).notNull(),
    dataType: attributeDataType('data_type').notNull(),
    unitKind: unitKind('unit_kind'),
    // ATR-10: kept for the products that use it, gone from suggestions and the picker.
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('attributes_tenant_name_idx')
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(sql`${t.tenantId} IS NOT NULL`),
    uniqueIndex('attributes_platform_name_idx')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.tenantId} IS NULL`),
    check(
      'attributes_unit_check',
      sql`(${t.dataType} = 'number_with_unit') = (${t.unitKind} IS NOT NULL)`,
    ),
  ],
);

// An attribute's values. A shop may add its own to a platform attribute; platform values are shared by every shop.
// A number-with-unit attribute's values are numbers in its kind's base unit (g, ml, count).
export const attributeOptions = tenant.table(
  'attribute_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    tenantId: uuid('tenant_id'),
    value: varchar('value', { length: OPTION_VALUE_MAX_LENGTH }).notNull(),
    // ATR-18: an optional colour swatch, #RRGGBB. The image swatch (MED-03) arrives with media in Slice 6.
    swatchColor: varchar('swatch_color', { length: 7 }),
    sortOrder: integer('sort_order').notNull().default(0),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Lets a value row prove its option belongs to its attribute (DAT-02).
    unique('attribute_options_attribute_id_key').on(t.attributeId, t.id),
    uniqueIndex('attribute_options_platform_value_idx')
      .on(t.attributeId, sql`lower(${t.value})`)
      .where(sql`${t.tenantId} IS NULL`),
    uniqueIndex('attribute_options_tenant_value_idx')
      .on(t.tenantId, t.attributeId, sql`lower(${t.value})`)
      .where(sql`${t.tenantId} IS NOT NULL`),
    check('attribute_options_swatch_check', sql`${t.swatchColor} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

// ATL-02, ATL-03: the attributes a product uses and what each does. Triggers refuse an enum-multi (or any
// option-less) attribute as variant-defining and a fourth variant-defining attribute.
export const productAttributes = tenant.table(
  'product_attributes',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    role: attributeRole('role').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.productId, t.attributeId] }),
    foreignKey({
      name: 'product_attributes_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
  ],
);

// An informational attribute's value on a product: options (several for enum-multi), text, a number or yes/no.
export const productAttributeValues = tenant.table(
  'product_attribute_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    attributeId: uuid('attribute_id').notNull(),
    optionId: uuid('option_id'),
    textValue: text('text_value'),
    numberValue: numeric('number_value', { precision: 14, scale: 4 }),
    boolValue: boolean('bool_value'),
  },
  (t) => [
    foreignKey({
      name: 'product_attribute_values_attribute_fk',
      columns: [t.tenantId, t.productId, t.attributeId],
      foreignColumns: [
        productAttributes.tenantId,
        productAttributes.productId,
        productAttributes.attributeId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_attribute_values_option_fk',
      columns: [t.attributeId, t.optionId],
      foreignColumns: [attributeOptions.attributeId, attributeOptions.id],
    }),
    check(
      'product_attribute_values_one_value_check',
      sql`num_nonnulls(${t.optionId}, ${t.textValue}, ${t.numberValue}, ${t.boolValue}) = 1`,
    ),
    index('product_attribute_values_product_idx').on(t.tenantId, t.productId),
  ],
);

// ATL-04: what makes a live variant distinct, one option per variant-defining attribute. Keyed to the product's
// own attribute row, so an attribute in use cannot be removed from the product underneath its variants. A retired
// variant keeps none: its combination_key is enough to bring it back.
export const variantAttributeValues = tenant.table(
  'variant_attribute_values',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    attributeId: uuid('attribute_id').notNull(),
    optionId: uuid('option_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.variantId, t.attributeId] }),
    foreignKey({
      name: 'variant_attribute_values_variant_fk',
      columns: [t.tenantId, t.productId, t.variantId],
      foreignColumns: [productVariants.tenantId, productVariants.productId, productVariants.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'variant_attribute_values_attribute_fk',
      columns: [t.tenantId, t.productId, t.attributeId],
      foreignColumns: [
        productAttributes.tenantId,
        productAttributes.productId,
        productAttributes.attributeId,
      ],
    }),
    foreignKey({
      name: 'variant_attribute_values_option_fk',
      columns: [t.attributeId, t.optionId],
      foreignColumns: [attributeOptions.attributeId, attributeOptions.id],
    }),
  ],
);

// ATR-02, ATL-05: a category's suggested attributes, as references to the attribute rows themselves.
export const categoryAttributes = tenant.table(
  'category_attributes',
  {
    tenantId: uuid('tenant_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.categoryId, t.attributeId] }),
    foreignKey({
      name: 'category_attributes_category_fk',
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }).onDelete('cascade'),
  ],
);

// ATR-16: values inserted in one tap. Same two scopes as attributes: tenant_id NULL is a platform set (offered first
// to shops of its preset_key's type), a tenant id is a set that shop saved. The values are plain text, matched to
// or added as options of whichever attribute they are inserted into.
export const optionSets = tenant.table(
  'option_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: varchar('name', { length: OPTION_SET_NAME_MAX_LENGTH }).notNull(),
    presetKey: text('preset_key'),
    options: text('options').array().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('option_sets_tenant_name_idx')
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(sql`${t.tenantId} IS NOT NULL`),
    uniqueIndex('option_sets_platform_name_idx')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.tenantId} IS NULL`),
    check('option_sets_options_check', sql`cardinality(${t.options}) BETWEEN 1 AND 50`),
    check('option_sets_preset_check', sql`${t.tenantId} IS NULL OR ${t.presetKey} IS NULL`),
  ],
);

export type SelectAttribute = typeof attributes.$inferSelect;
export type SelectAttributeOption = typeof attributeOptions.$inferSelect;
export type SelectProductAttribute = typeof productAttributes.$inferSelect;
export type SelectProductAttributeValue = typeof productAttributeValues.$inferSelect;
export type SelectVariantAttributeValue = typeof variantAttributeValues.$inferSelect;
export type SelectOptionSet = typeof optionSets.$inferSelect;
