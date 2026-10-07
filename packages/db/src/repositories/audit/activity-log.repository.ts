import { and, desc, eq, gte, lt, lte, or } from 'drizzle-orm';
import { activityLog, type InsertActivityLog, type SelectActivityLog } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface ActivityFilters {
  dateFrom?: Date;
  dateTo?: Date;
  actorId?: string;
  action?: string;
}

// The last row the caller saw, for keyset pagination (ENGINEERING-STANDARDS §5: never OFFSET).
export interface ActivityCursor {
  createdAt: Date;
  id: number;
}

// AUD-01 to AUD-08: one shop's activity log. The table is insert-only at the database role level (see migration
// 0001); this repository never updates or deletes a row it did not insert itself.
export class ActivityLogRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insert(tx: Transaction, values: InsertActivityLog): Promise<void> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    await tx.insert(activityLog).values(values);
  }

  /** Newest first, keyset-paginated on (created_at, id). */
  async list(
    tx: Transaction,
    tenantId: string,
    filters: ActivityFilters,
    cursor: ActivityCursor | null,
    limit: number,
  ): Promise<SelectActivityLog[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions = [eq(activityLog.tenantId, tenantId)];
    if (filters.dateFrom) conditions.push(gte(activityLog.createdAt, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(activityLog.createdAt, filters.dateTo));
    if (filters.actorId) conditions.push(eq(activityLog.actorId, filters.actorId));
    if (filters.action) conditions.push(eq(activityLog.action, filters.action));
    if (cursor) {
      const cursorCondition = or(
        lt(activityLog.createdAt, cursor.createdAt),
        and(eq(activityLog.createdAt, cursor.createdAt), lt(activityLog.id, cursor.id)),
      );
      // Both branches are always given, so this is always defined; the check keeps the type honest.
      if (cursorCondition) conditions.push(cursorCondition);
    }
    return tx
      .select()
      .from(activityLog)
      .where(and(...conditions))
      .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
      .limit(limit);
  }

  /** Deletes entries older than the cutoff for one shop (AUD-06). Returns how many were removed. */
  async purgeOlderThan(tx: Transaction, tenantId: string, cutoff: Date): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(activityLog)
      .where(and(eq(activityLog.tenantId, tenantId), lt(activityLog.createdAt, cutoff)))
      .returning({ id: activityLog.id });
    return rows.length;
  }
}
