import { and, count, desc, eq, gte, lt, lte, notInArray, or } from 'drizzle-orm';
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

  /** DWN-11: how many entries (excluding money-related ones, which survive independently -- AUD-07) fall
   * strictly between `after` and `before` -- the "what will be trimmed" count for the retention-shrink notice. */
  async countInRange(
    tx: Transaction,
    tenantId: string,
    range: { after: Date; before: Date; excludeActions: string[] },
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions = [
      eq(activityLog.tenantId, tenantId),
      gte(activityLog.createdAt, range.after),
      lt(activityLog.createdAt, range.before),
    ];
    if (range.excludeActions.length > 0) {
      conditions.push(notInArray(activityLog.action, range.excludeActions));
    }
    const rows = await tx
      .select({ value: count() })
      .from(activityLog)
      .where(and(...conditions));
    return rows[0]?.value ?? 0;
  }
}
