import { sql } from 'drizzle-orm';
import { bigserial, check, index, smallint, uuid, varchar } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

// API-27, D8-3, D8-21 to D8-23 (Phase 8 Slice 8.1, read agreed 2026-11-07): each server fault a shop's request hit, kept
// 7 days for the operator's shop page (ADM-03). Server faults only (500 and 503), never a refusal. A row holds what can
// be shown to the operator without holding a customer's details: the route's pattern, never the address it was called
// at; the error's kind, never its message or stack, which go to the server log under the same request ID. A Lytro table
// keyed by shop, since the error filter runs outside the shop's transaction.
export const requestErrors = control.table(
  'request_errors',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requestId: varchar('request_id', { length: 9 }).notNull(),
    method: varchar('method', { length: 10 }).notNull(),
    // Null when the fault came before a route was matched.
    route: varchar('route', { length: 200 }),
    status: smallint('status').notNull(),
    // An unexpected fault's class (with the database's own code when it has one); a 503's message key.
    kind: varchar('kind', { length: 120 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('request_errors_tenant_idx').on(t.tenantId, t.createdAt),
    index('request_errors_created_idx').on(t.createdAt),
    check('request_errors_status_check', sql`${t.status} in (500, 503)`),
    check(
      'request_errors_request_id_check',
      sql`${t.requestId} ~ '^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'`,
    ),
  ],
);
