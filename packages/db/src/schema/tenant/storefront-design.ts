import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenant } from '../shared';

// STOREFRONT-BUILDER-PLAN SB-12, SB-14 (2026-11-18): a shop's storefront design, one row per shop that has ever saved
// one. Each copy is a whole design document (`storefrontDesignSchema`): the draft the editor saves, the one shoppers
// see, and the one before it, which "back" restores. A shop with no row shows its type's starting design (SB-11).
// `media_ids` lists every photo any copy names, so the media library counts the uses without reading the documents.
export const storefrontDesigns = tenant.table('storefront_designs', {
  tenantId: uuid('tenant_id').primaryKey(),
  draft: jsonb('draft'),
  published: jsonb('published'),
  previous: jsonb('previous'),
  mediaIds: uuid('media_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  draftSavedAt: timestamp('draft_saved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // STOREFRONT-BUILDER-PLAN DC-2: each design of a product its own card in the shop's lists; on unless turned off.
  designCards: boolean('design_cards').notNull().default(true),
});

export type SelectStorefrontDesign = typeof storefrontDesigns.$inferSelect;
export type InsertStorefrontDesign = typeof storefrontDesigns.$inferInsert;

/**
 * STOREFRONT-BUILDER-PLAN DC-6, DC-7: the seller's order of the shop's cards -- a product, or one of its designs -- one
 * row per card the seller has placed. A card with no row (a new product or design) comes before every placed one.
 * One row per product and design (none for a product's own card): a unique index that treats no design as one value,
 * and the keys to the product and the design, are in the migration.
 */
export const storefrontCardPositions = tenant.table(
  'storefront_card_positions',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    designOptionId: uuid('design_option_id'),
    position: integer('position').notNull(),
  },
  (table) => [index('storefront_card_positions_product_idx').on(table.tenantId, table.productId)],
);

export type SelectStorefrontCardPosition = typeof storefrontCardPositions.$inferSelect;

/**
 * STOREFRONT-BUILDER-PLAN DC-8: how a product with two or more designs shows while design cards are on -- `designs` (a
 * card per design, the default, kept as no row), `compact` (its one card) or `both`. Its check and its key to the
 * product are in the migration.
 */
export const storefrontProductCards = tenant.table(
  'storefront_product_cards',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    mode: text('mode').notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.productId] })],
);
