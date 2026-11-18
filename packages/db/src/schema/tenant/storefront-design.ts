import { sql } from 'drizzle-orm';
import { jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
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
});

export type SelectStorefrontDesign = typeof storefrontDesigns.$inferSelect;
export type InsertStorefrontDesign = typeof storefrontDesigns.$inferInsert;
