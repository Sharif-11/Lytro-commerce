import { sql } from 'drizzle-orm';
import { bigserial, check, index, jsonb, numeric, uuid } from 'drizzle-orm/pg-core';
import { enumTuple, LedgerEntryType } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

export const ledgerEntryType = tenant.enum(
  'ledger_entry_type',
  enumTuple(Object.values(LedgerEntryType)),
);

// DATABASE-SCHEMA §3.4. BAL-02: the only way a tenant's balance changes. Triggers created in the migrations keep it
// so: inserting an entry locks the tenant row, fills balance_after and moves control.tenants.balance_amount to it
// (0055); the balance cannot change any other way (0055); and an entry is never updated, deleted or truncated
// (0026, 0055), the same tenant.reject_mutation() function tenant.activity_log uses.
export const balanceLedger = tenant.table(
  'balance_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    type: ledgerEntryType('type').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), // signed, never zero
    units: numeric('units', { precision: 10, scale: 2 }),
    rateUsed: numeric('rate_used', { precision: 12, scale: 4 }),
    reference: jsonb('reference'),
    // Filled by the insert trigger from the locked balance; whatever the writer passes is overwritten.
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: createdAt(),
  },
  (t) => [
    index('balance_ledger_tenant_created_idx').on(t.tenantId, t.createdAt),
    check('balance_ledger_amount_nonzero', sql`${t.amount} <> 0`),
  ],
);

export type SelectBalanceLedger = typeof balanceLedger.$inferSelect;
export type InsertBalanceLedger = typeof balanceLedger.$inferInsert;
