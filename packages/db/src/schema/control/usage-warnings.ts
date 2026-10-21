import { integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control } from '../shared';
import { tenants } from './tenancy';

// LIM-01: the highest share of a limit a shop was warned of in one cycle, for each metric, so each warning is sent
// once. Bandwidth and API requests keep theirs beside their own counts (`media_bandwidth`, `api_usage`).
export const usageWarnings = control.table(
  'usage_warnings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    metric: text('metric').notNull(),
    cycleStart: timestamp('cycle_start', { withTimezone: true }).notNull(),
    warnedPercent: integer('warned_percent').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'usage_warnings_pkey', columns: [t.tenantId, t.metric, t.cycleStart] }),
  ],
);

export type SelectUsageWarning = typeof usageWarnings.$inferSelect;
