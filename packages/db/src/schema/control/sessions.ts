import { SignInMethod } from '@lytronix/validators';
import { boolean, index, inet, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
    // Null during the brief window between identity verification and shop creation (D13, AUTH-28).
    tenantId: uuid('tenant_id').references(() => tenants.id),
    userId: uuid('user_id'), // staff user; null for the owner's own session. Points into tenant schema by value.
    // AUTH-19: blocks all dashboard routes until POST auth/password is called.
    mustSetPassword: boolean('must_set_password').notNull().default(false),
    // How the session was opened. AUTH-20 allows a password change without the current one within 10 minutes of a code.
    signInMethod: text('sign_in_method').$type<SignInMethod>().notNull().default(SignInMethod.Code),
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
