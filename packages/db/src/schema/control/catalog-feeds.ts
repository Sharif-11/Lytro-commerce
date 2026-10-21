import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { bytea, control } from '../shared';
import { tenants } from './tenancy';

// FED-01, FED-05, FED-06: each shop's Meta catalog feed link, one row per shop. A feed request names only its token,
// so the row is found by the token's SHA-256 hash before the shop is known -- hence the control schema, as with API
// keys. The token itself is kept sealed by the server's secret box (SEC-10), so the dashboard can show the link again
// while a copy of the database shows none that works. Replacing the link replaces both.
export const catalogFeeds = control.table('catalog_feeds', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  tokenHash: bytea('token_hash').notNull().unique('catalog_feeds_token_hash_key'),
  tokenEnc: bytea('token_enc').notNull(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectCatalogFeed = typeof catalogFeeds.$inferSelect;
