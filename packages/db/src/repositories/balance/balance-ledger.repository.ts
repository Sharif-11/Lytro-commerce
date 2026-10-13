import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import type { LedgerEntryType } from '@lytronix/validators';
import { balanceLedger, type InsertBalanceLedger, type SelectBalanceLedger } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface LedgerFilters {
  type?: LedgerEntryType;
  dateFrom?: Date;
  dateTo?: Date;
}

// The last row the caller saw, for keyset pagination (never OFFSET).
export interface LedgerCursor {
  id: number;
}

// BAL-02: the only writer of tenant.balance_ledger. Insert-only at the database role level (the migration adds
// a trigger reusing tenant.reject_mutation()); this repository never updates or deletes a row it inserted.
export class BalanceLedgerRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insert(tx: Transaction, values: InsertBalanceLedger): Promise<SelectBalanceLedger> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(balanceLedger).values(values).returning();
    if (!row) throw new Error('insert returned no ledger row');
    return row;
  }

  /** Newest first, keyset-paginated on id (BAL-14's statement). */
  async list(
    tx: Transaction,
    tenantId: string,
    filters: LedgerFilters,
    cursor: LedgerCursor | null,
    limit: number,
  ): Promise<SelectBalanceLedger[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions = [eq(balanceLedger.tenantId, tenantId)];
    if (filters.type) conditions.push(eq(balanceLedger.type, filters.type));
    if (filters.dateFrom) conditions.push(gte(balanceLedger.createdAt, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(balanceLedger.createdAt, filters.dateTo));
    if (cursor) conditions.push(lt(balanceLedger.id, cursor.id));
    return tx
      .select()
      .from(balanceLedger)
      .where(and(...conditions))
      .orderBy(desc(balanceLedger.id))
      .limit(limit);
  }

  /** BAL-02's invariant check: the sum of a tenant's own entries, re-derivable independently of balance_amount. */
  async sumFor(tx: Transaction, tenantId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ amount: balanceLedger.amount })
      .from(balanceLedger)
      .where(eq(balanceLedger.tenantId, tenantId));
    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    return total.toFixed(2);
  }
}
