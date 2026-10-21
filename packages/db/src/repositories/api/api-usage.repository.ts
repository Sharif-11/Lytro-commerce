import { and, eq, sql } from 'drizzle-orm';
import { apiUsage } from '../../schema';
import type { Executor } from '../../transactions';

/** One shop's requests in one billing cycle, as the database holds them. */
export interface ApiUsageRow {
  tenantId: string;
  cycleStart: Date;
  requests: number;
  warnedPercent: number;
}

/** What one server counted for a shop's cycle since it last added its counts. */
export interface ApiUsageCounts {
  requests: number;
  /** RTE-06: the requests the per-visitor limit refused, and the visitors they came from not counted before. */
  refusedRequests: number;
  refusedVisitors: number;
}

// RTE-03, D3-2: each shop's requests per billing cycle. The servers count in memory and add their counts here every
// minute; enforcement reads this total and adds what is not flushed yet.
export class ApiUsageRepository {
  /** Adds the counts to the cycle's, under its row lock; the cycle's requests as they now are. */
  async add(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    counts: ApiUsageCounts,
  ): Promise<ApiUsageRow> {
    const [row] = await db
      .insert(apiUsage)
      .values({ tenantId, cycleStart, ...counts })
      .onConflictDoUpdate({
        target: [apiUsage.tenantId, apiUsage.cycleStart],
        set: {
          requests: sql`${apiUsage.requests} + ${counts.requests}`,
          refusedRequests: sql`${apiUsage.refusedRequests} + ${counts.refusedRequests}`,
          refusedVisitors: sql`${apiUsage.refusedVisitors} + ${counts.refusedVisitors}`,
          updatedAt: new Date(),
        },
      })
      .returning({
        tenantId: apiUsage.tenantId,
        cycleStart: apiUsage.cycleStart,
        requests: apiUsage.requests,
        warnedPercent: apiUsage.warnedPercent,
      });
    if (!row) throw new Error('upsert returned no api usage row');
    return row;
  }

  async find(db: Executor, tenantId: string, cycleStart: Date): Promise<ApiUsageRow | null> {
    const rows = await db
      .select({
        tenantId: apiUsage.tenantId,
        cycleStart: apiUsage.cycleStart,
        requests: apiUsage.requests,
        warnedPercent: apiUsage.warnedPercent,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** RTE-03: records the highest warning sent for the cycle, so each is sent once. */
  async setWarned(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    percent: number,
  ): Promise<void> {
    await db
      .update(apiUsage)
      .set({ warnedPercent: percent })
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)));
  }
}
