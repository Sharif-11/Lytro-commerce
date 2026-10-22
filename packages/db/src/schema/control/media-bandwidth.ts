import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PackAutoBuyState } from '@lytronix/validators';
import { control } from '../shared';
import { tenants } from './tenancy';

// BND-01, BND-05, BND-06: a shop's media bandwidth in one billing cycle -- every request the media Worker answered
// for it and the bytes the bodies sent, totalled from the Worker's usage every minute -- and the highest warning (50,
// 80 or 95 percent of the cycle's limit) sent for it. A new cycle (a new period, an upgrade) starts a new row at 0.
export const mediaBandwidth = control.table(
  'media_bandwidth',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cycleStart: timestamp('cycle_start', { withTimezone: true }).notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
    requests: bigint('requests', { mode: 'number' }).notNull().default(0),
    warnedPercent: integer('warned_percent').notNull().default(0),
    // BND-04, PLN-15: what the cycle took from the shop's bandwidth packs, in bytes -- its use past the limit, as far as
    // the packs reach -- and the grace use written off when a pack was bought past the allowance. What a pack holds is
    // what it bought less what every cycle took, so packs carry over until used.
    packUsed: bigint('pack_used', { mode: 'number' }).notNull().default(0),
    packFree: bigint('pack_free', { mode: 'number' }).notNull().default(0),
    // BND-04: packs auto-buy bought this cycle (at most PACK_AUTO_BUY_CAP), and one asked for or one the balance failed.
    autoPacks: integer('auto_packs').notNull().default(0),
    autoBuyState: text('auto_buy_state').$type<PackAutoBuyState>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'media_bandwidth_pkey', columns: [t.tenantId, t.cycleStart] }),
    check(
      'media_bandwidth_packs_check',
      sql`${t.packUsed} >= 0 AND ${t.packFree} >= 0 AND ${t.autoPacks} >= 0 AND (${t.autoBuyState} IS NULL OR ${t.autoBuyState} IN ('requested', 'failed'))`,
    ),
    check('media_bandwidth_counts_check', sql`${t.bytes} >= 0 AND ${t.requests} >= 0`),
  ],
);

// BND-08: the same, per Asia/Dhaka calendar day of a cycle, for the dashboard's daily chart. Each day belongs to its
// cycle, so a cycle that starts part-way through a day still has days that total exactly its row.
export const mediaBandwidthDaily = control.table(
  'media_bandwidth_daily',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cycleStart: timestamp('cycle_start', { withTimezone: true }).notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
    requests: bigint('requests', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'media_bandwidth_daily_pkey', columns: [t.tenantId, t.cycleStart, t.day] }),
    check('media_bandwidth_daily_counts_check', sql`${t.bytes} >= 0 AND ${t.requests} >= 0`),
  ],
);

// BND-02: how far the media Worker's usage has been totalled, so each minute adds only what is new, once. One row.
export const mediaUsagePull = control.table(
  'media_usage_pull',
  {
    id: smallint('id').primaryKey().default(1),
    pulledUntil: timestamp('pulled_until', { withTimezone: true }).notNull(),
  },
  (t) => [check('media_usage_pull_one_row', sql`${t.id} = 1`)],
);

export type SelectMediaBandwidth = typeof mediaBandwidth.$inferSelect;
export type SelectMediaBandwidthDaily = typeof mediaBandwidthDaily.$inferSelect;
