import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { PackAutoBuyState } from '@lytronix/validators';
import {
  API_KEY_NAME_MAX_LENGTH,
  ApiKeyPurpose,
  ApiKeyType,
  enumTuple,
} from '@lytronix/validators';
import { bytea, control, createdAt } from '../shared';
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
    // Slice 12: a key the platform keeps for the shop's own storefront (null for one the shop made), and the value
    // sealed (SEC-10), since the storefront's server must present it and only the hash is kept otherwise.
    purpose: text('purpose').$type<ApiKeyPurpose>(),
    sealedValue: bytea('sealed_value'),
  },
  (t) => [
    check(
      'api_keys_purpose_check',
      sql`(${t.purpose} IS NULL OR ${t.purpose} IN (${sql.raw(
        Object.values(ApiKeyPurpose)
          .map((value) => `'${value}'`)
          .join(', '),
      )})) AND (${t.purpose} IS NULL) = (${t.sealedValue} IS NULL)`,
    ),
    // One live storefront key per shop.
    uniqueIndex('api_keys_storefront_idx')
      .on(t.tenantId)
      .where(sql`${t.purpose} = 'storefront' AND ${t.revokedAt} IS NULL`),
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
    // RTE-08 (amended 2026-10-30): the orders the shop's per-minute window refused this cycle, so the operator can see
    // whether a real shop's busy minute meets it.
    refusedOrders: integer('refused_orders').notNull().default(0),
    // RTE-12: when the operators were last told of a fast hour's spending, so they are told at most once a day.
    fastSpendAlertedAt: timestamp('fast_spend_alerted_at', { withTimezone: true }),
    // RTE-11, PLN-15: what the cycle took from the shop's request packs, and the grace use written off when a pack was
    // bought past the allowance; packs auto-buy bought this cycle, and one asked for or failed -- as media_bandwidth.
    packUsed: bigint('pack_used', { mode: 'number' }).notNull().default(0),
    packFree: bigint('pack_free', { mode: 'number' }).notNull().default(0),
    autoPacks: integer('auto_packs').notNull().default(0),
    autoBuyState: text('auto_buy_state').$type<PackAutoBuyState>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'api_usage_pkey', columns: [t.tenantId, t.cycleStart] }),
    check(
      'api_usage_packs_check',
      sql`${t.packUsed} >= 0 AND ${t.packFree} >= 0 AND ${t.autoPacks} >= 0 AND (${t.autoBuyState} IS NULL OR ${t.autoBuyState} IN ('requested', 'failed'))`,
    ),
  ],
);

// BND-08's twin for API requests (Slice 11.5a.2, agreed 2026-10-23): a shop's requests on each Asia/Dhaka day of a
// cycle, added in the same minute's flush as the cycle's own total, so the usage page can draw them and pace the run-out
// date. Together a cycle's days total its row in api_usage.
export const apiUsageDaily = control.table(
  'api_usage_daily',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cycleStart: timestamp('cycle_start', { withTimezone: true }).notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    requests: bigint('requests', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'api_usage_daily_pkey', columns: [t.tenantId, t.cycleStart, t.day] }),
    check('api_usage_daily_requests_check', sql`${t.requests} >= 0`),
  ],
);

export type SelectApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type SelectApiUsage = typeof apiUsage.$inferSelect;
