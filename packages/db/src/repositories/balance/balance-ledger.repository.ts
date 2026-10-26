import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { LedgerEntryType } from '@lytronix/validators';
import { balanceLedger, type InsertBalanceLedger, type SelectBalanceLedger } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface LedgerFilters {
  types?: LedgerEntryType[];
  dateFrom?: Date;
  dateTo?: Date;
}

// The last row the caller saw, for keyset pagination (never OFFSET).
export interface LedgerCursor {
  id: number;
}

// BAL-02: the only writer of tenant.balance_ledger. Insert-only for every role (triggers reusing
// tenant.reject_mutation()); the insert trigger moves the tenant's balance and fills balance_after, so an insert is
// the whole balance change and this repository never updates or deletes a row it inserted.
export class BalanceLedgerRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insert(tx: Transaction, values: InsertBalanceLedger): Promise<SelectBalanceLedger> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(balanceLedger).values(values).returning();
    if (!row) throw new Error('insert returned no ledger row');
    return row;
  }

  /** What the shop's entries of these types came to since `since`, as a signed amount (a charge is negative). */
  async sumSince(
    tx: Transaction,
    tenantId: string,
    types: LedgerEntryType[],
    since: Date,
  ): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({
        total: sql<string>`coalesce(sum(${balanceLedger.amount}), 0)::numeric(14, 2)::text`,
      })
      .from(balanceLedger)
      .where(
        and(
          eq(balanceLedger.tenantId, tenantId),
          inArray(balanceLedger.type, types),
          gte(balanceLedger.createdAt, since),
        ),
      );
    return row?.total ?? '0.00';
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
    if (filters.types?.length) conditions.push(inArray(balanceLedger.type, filters.types));
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
}
