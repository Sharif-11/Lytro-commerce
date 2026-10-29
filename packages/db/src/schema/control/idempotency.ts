import { integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// API-11, D4-8: every write with a cost or side effect accepts an Idempotency-Key header, and order creation requires
// it. Stored in Postgres, not Redis (RED-07). A key belongs to one shop and one caller (a staff member, the owner, or
// an API key), so two callers never collide on the same value. The primary key is what makes two simultaneous requests
// with the same key run once; a request that fails gives its key back, so a retry runs again.
export const idempotencyKeys = control.table(
  'idempotency_keys',
  {
    tenantId: uuid('tenant_id').notNull(),
    // Who sent it: `user:<id>` for a dashboard session, `key:<id>` for an API key.
    caller: text('caller').notNull(),
    key: text('key').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'), // null while the original request is still in flight
    responseBody: jsonb('response_body'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // API-11: 24h from createdAt
  },
  (t) => [primaryKey({ name: 'idempotency_keys_pkey', columns: [t.tenantId, t.caller, t.key] })],
);

export type SelectIdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type InsertIdempotencyKey = typeof idempotencyKeys.$inferInsert;
