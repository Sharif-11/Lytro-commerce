import { integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// API-11: every write with a cost or side effect accepts an Idempotency-Key header. Stored in Postgres, not
// Redis (RED-07). The unique primary key on `key` is what makes two simultaneous requests with the same key
// execute the handler exactly once -- the second insert attempt fails with a unique violation and that request
// waits for/replays the first one's stored response instead of re-running the handler.
export const idempotencyKeys = control.table('idempotency_keys', {
  key: text('key').primaryKey(),
  path: text('path').notNull(),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'), // null while the original request is still in flight
  responseBody: jsonb('response_body'),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // API-11: 24h from createdAt
});

export type SelectIdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type InsertIdempotencyKey = typeof idempotencyKeys.$inferInsert;
