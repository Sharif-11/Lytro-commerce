import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { API_KEY_NAME_MAX_LENGTH, ApiKeyType, enumTuple } from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

export const apiKeyType = control.enum('api_key_type', enumTuple(Object.values(ApiKeyType)));

// API-01, API-03, API-04, API-08, D3-1: a shop's API keys. In the control schema because the public API finds a key
// before it knows the shop. Only the key's SHA-256 hash is kept (the key is 32 random characters, so a slow hash
// adds nothing), with a short prefix the shop can recognise it by; the value itself is shown once. A public key
// works only from the website addresses registered on it (each an exact origin). A revoked key stays, as history.
export const apiKeys = control.table(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    type: apiKeyType('type').notNull().default(ApiKeyType.Public),
    name: varchar('name', { length: API_KEY_NAME_MAX_LENGTH }).notNull(),
    prefix: varchar('prefix', { length: 24 }).notNull(),
    keyHash: char('key_hash', { length: 64 }).notNull().unique(),
    websites: text('websites').array().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
  },
  (t) => [
    index('api_keys_tenant_idx').on(t.tenantId, t.createdAt),
    // API-23: a preflight carries no key, so it is answered by whether any live key registers its origin.
    index('api_keys_websites_idx')
      .using('gin', t.websites)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

// RTE-03, D3-2: the requests a shop's keys made in one billing cycle, flushed from the server's own counts every
// minute, and the highest warning (50, 80 or 95 percent of the cycle's limit) the shop was sent for it.
export const apiUsage = control.table(
  'api_usage',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cycleStart: timestamp('cycle_start', { withTimezone: true }).notNull(),
    requests: bigint('requests', { mode: 'number' }).notNull().default(0),
    warnedPercent: integer('warned_percent').notNull().default(0),
    // RTE-06, KNOWN-GAPS §82: the requests the per-visitor limit refused this cycle, and how many visitors they came
    // from, so the operator can see whether many real shoppers behind one address meet the limit.
    refusedRequests: bigint('refused_requests', { mode: 'number' }).notNull().default(0),
    refusedVisitors: integer('refused_visitors').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'api_usage_pkey', columns: [t.tenantId, t.cycleStart] })],
);

export type SelectApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type SelectApiUsage = typeof apiUsage.$inferSelect;
