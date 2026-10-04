import { index, inet, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { subscribers } from './identity';
import { tenants } from './tenancy';

// Decision D1: server-side sessions in Postgres. Lives in `control` because a session is looked up before
// the tenant context is set, so it cannot sit behind row-level security. Stores hashes only (SEC-07).
// Kept in its own file because it depends on both identity and tenancy; nothing imports it, so no cycle.
export const sessions = control.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 of the cookie value, never the value
    csrfHash: text('csrf_hash').notNull(), // SHA-256 of the per-session CSRF token (SEC-14)
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id), // TEN-28: must equal the host's tenant on every request
    userId: uuid('user_id'), // staff user; null for the owner's own session. Points into tenant schema by value.
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: inet('ip'),
  },
  (t) => [
    index('sessions_subscriber_idx').on(t.subscriberId),
    index('sessions_tenant_idx').on(t.tenantId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export type SelectSession = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
export type UpdateSession = Partial<InsertSession>;
