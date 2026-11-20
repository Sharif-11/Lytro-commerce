import { boolean, integer, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from '../shared';

/**
 * SB-10 (the owner, 2026-11-20): what a storefront card says of a product from the shop's counted orders -- "Ordered N
 * times" (the delivered orders that held it, ever) and "Best seller" (among the shop's few most sold over the last
 * days) -- kept per shop, so a product list reads them instead of going through the shop's orders on every page. Only a
 * product ordered at least once has a row; a missing one reads as never ordered. Worked out again by the minute tick
 * within 5 minutes of the shop's orders changing, and once a day besides. "Only N left" is never kept: it is read live.
 * The product's key and the row-level security policy are in the migration.
 */
export const productCardFacts = tenant.table(
  'product_card_facts',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    ordered: integer('ordered').notNull(),
    bestSeller: boolean('best_seller').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.productId] })],
);

export type SelectProductCardFacts = typeof productCardFacts.$inferSelect;

/**
 * SB-10: when a shop's card facts were last worked out, by the database's clock. No row: never, so its lists work them
 * out live, as they do once the last run is more than a day old (the tick has stopped).
 */
export const cardFactRuns = tenant.table('card_fact_runs', {
  tenantId: uuid('tenant_id').primaryKey(),
  workedAt: timestamp('worked_at', { withTimezone: true }).notNull(),
});
