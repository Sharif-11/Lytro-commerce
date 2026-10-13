import { bigserial, index, jsonb, numeric, text, uuid } from 'drizzle-orm/pg-core';
import type { LedgerEntryType } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

// DATABASE-SCHEMA §3.4. BAL-02: the only way a tenant's balance changes. Insert-only: a trigger created in the
// migration refuses UPDATE and DELETE (BAL-02, DAT-10), the same tenant.reject_mutation() function
// tenant.activity_log already uses.
export const balanceLedger = tenant.table(
  'balance_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    type: text('type').$type<LedgerEntryType>().notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), // signed
    units: numeric('units', { precision: 10, scale: 2 }),
    rateUsed: numeric('rate_used', { precision: 12, scale: 4 }),
    reference: jsonb('reference'),
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('balance_ledger_tenant_created_idx').on(t.tenantId, t.createdAt)],
);

export type SelectBalanceLedger = typeof balanceLedger.$inferSelect;
export type InsertBalanceLedger = typeof balanceLedger.$inferInsert;
