import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { optionSets, type SelectOptionSet } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// ATR-16: the option sets a shop sees (the platform's and its own) and the ones it saves. Row-level security already
// hides other shops' sets; every query also names the scope it means.
export class OptionSetRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** The platform's sets, then the shop's own, each in order. */
  async listOptionSets(tx: Transaction, tenantId: string): Promise<SelectOptionSet[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(optionSets)
      .where(or(isNull(optionSets.tenantId), eq(optionSets.tenantId, tenantId)))
      .orderBy(
        sql`${optionSets.tenantId} IS NOT NULL`,
        asc(optionSets.sortOrder),
        sql`lower(${optionSets.name})`,
      );
  }

  async insertOptionSet(
    tx: Transaction,
    values: { tenantId: string; name: string; options: string[] },
  ): Promise<SelectOptionSet> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(optionSets).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no option set row');
    return row;
  }

  /** Removes one of the shop's own sets; false when it has none by that id. */
  async deleteOptionSet(tx: Transaction, tenantId: string, id: string): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(optionSets)
      .where(and(eq(optionSets.tenantId, tenantId), eq(optionSets.id, id)))
      .returning({ id: optionSets.id });
    return rows.length > 0;
  }
}
