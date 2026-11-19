import {
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { OFFER_NAME_MAX_LENGTH, type OfferCutKind, type OfferState } from '@lytronix/validators';
import { tenant } from '../shared';

/**
 * OFFERS-PLAN (the owner, 2026-11-18 and 19): a named price cut on chosen products, or on some designs of a product.
 * `state` is waiting (made ready, no price changed), running or ended (OF-14); `cut_kind` and `cut_amount` are a percent
 * (1 to 90) or whole taka off (OF-2, OF-18). `slug` is its link name in the shop (OF-21), unique in the shop while the
 * offer is kept. The checks on state and cut, and the keys, are in the migration.
 */
export const offers = tenant.table(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: OFFER_NAME_MAX_LENGTH }).notNull(),
    slug: text('slug').notNull(),
    cutKind: text('cut_kind').$type<OfferCutKind>().notNull(),
    cutAmount: integer('cut_amount').notNull(),
    state: text('state').$type<OfferState>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('offers_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('offers_tenant_slug_unique').on(table.tenantId, table.slug),
    index('offers_tenant_state_idx').on(table.tenantId, table.state),
  ],
);

export type SelectOffer = typeof offers.$inferSelect;
export type InsertOffer = typeof offers.$inferInsert;

/**
 * OF-9: what an offer holds -- a product whole (`design_option_id` null) or one of its designs. Kept after the offer
 * ends, for its ended page and Run it again (OF-12, OF-14). One row per product and design in an offer (the unique
 * index, no design counted as one value, is in the migration).
 */
export const offerItems = tenant.table(
  'offer_items',
  {
    tenantId: uuid('tenant_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    productId: uuid('product_id').notNull(),
    designOptionId: uuid('design_option_id'),
  },
  (table) => [index('offer_items_product_idx').on(table.tenantId, table.productId)],
);

export type SelectOfferItem = typeof offerItems.$inferSelect;

/**
 * OF-6: while an offer runs, one row per size (variant) whose price it set: the size's own price and regular price
 * before (each null when the size took the product's), the price it sold at when the offer took it (`price_at_start`,
 * what a new cut is worked out from, OF-15), and the offer price. One row per size: no size is in two running offers
 * (OF-16), however two changes meet. End puts each back exactly and removes the rows.
 */
export const offerPrices = tenant.table(
  'offer_prices',
  {
    tenantId: uuid('tenant_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    productId: uuid('product_id').notNull(),
    priceBefore: numeric('price_before', { precision: 10, scale: 2 }),
    regularBefore: numeric('regular_before', { precision: 10, scale: 2 }),
    priceAtStart: numeric('price_at_start', { precision: 10, scale: 2 }).notNull(),
    offerPrice: numeric('offer_price', { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.variantId] }),
    index('offer_prices_offer_idx').on(table.tenantId, table.offerId),
  ],
);

export type SelectOfferPrice = typeof offerPrices.$inferSelect;
