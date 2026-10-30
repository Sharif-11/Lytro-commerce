import { and, asc, eq, sql } from 'drizzle-orm';
import { apiUsage, apiUsageDaily } from '../../schema';
import type { Executor } from '../../transactions';
import type { CyclePackFields, TenantTotal } from '../billing/addon-purchase.repository';

const ROW = {
  tenantId: apiUsage.tenantId,
  cycleStart: apiUsage.cycleStart,
  requests: apiUsage.requests,
  warnedPercent: apiUsage.warnedPercent,
  fastSpendAlertedAt: apiUsage.fastSpendAlertedAt,
  packUsed: apiUsage.packUsed,
  packFree: apiUsage.packFree,
  autoPacks: apiUsage.autoPacks,
  autoBuyState: apiUsage.autoBuyState,
};

/** One shop's requests in one billing cycle, as the database holds them. */
export interface ApiUsageRow extends CyclePackFields {
  tenantId: string;
  cycleStart: Date;
  requests: number;
  warnedPercent: number;
  /** RTE-12: when the last fast-spend alert of the cycle went out, if one did. */
  fastSpendAlertedAt: Date | null;
}

/** A shop's requests on one Asia/Dhaka day of a cycle (YYYY-MM-DD). */
export interface ApiUsageDayRow {
  day: string;
  requests: number;
}

/** What one server counted for a shop's cycle since it last added its counts. */
export interface ApiUsageCounts {
  requests: number;
  /** RTE-06: the requests the per-visitor limit refused, and the visitors they came from not counted before. */
  refusedRequests: number;
  refusedVisitors: number;
  /** RTE-08: the orders the shop's per-minute window refused. */
  refusedOrders: number;
}

// RTE-03, D3-2: each shop's requests per billing cycle. The servers count in memory and add their counts here every
// minute; enforcement reads this total and adds what is not flushed yet.
export class ApiUsageRepository {
  /**
   * Adds the counts to the cycle's, under its row lock, and its requests to the day's; the cycle's requests as they now
   * are.
   */
  async add(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    counts: ApiUsageCounts,
    day: string,
  ): Promise<ApiUsageRow> {
    if (counts.requests > 0) {
      await db
        .insert(apiUsageDaily)
        .values({ tenantId, cycleStart, day, requests: counts.requests })
        .onConflictDoUpdate({
          target: [apiUsageDaily.tenantId, apiUsageDaily.cycleStart, apiUsageDaily.day],
          set: { requests: sql`${apiUsageDaily.requests} + ${counts.requests}` },
        });
    }
    const [row] = await db
      .insert(apiUsage)
      .values({ tenantId, cycleStart, ...counts })
      .onConflictDoUpdate({
        target: [apiUsage.tenantId, apiUsage.cycleStart],
        set: {
          requests: sql`${apiUsage.requests} + ${counts.requests}`,
          refusedRequests: sql`${apiUsage.refusedRequests} + ${counts.refusedRequests}`,
          refusedVisitors: sql`${apiUsage.refusedVisitors} + ${counts.refusedVisitors}`,
          refusedOrders: sql`${apiUsage.refusedOrders} + ${counts.refusedOrders}`,
          updatedAt: new Date(),
        },
      })
      .returning(ROW);
    if (!row) throw new Error('upsert returned no api usage row');
    return row;
  }

  /** The days of the shop's cycle, in order; together they total the cycle's requests. */
  async listDays(db: Executor, tenantId: string, cycleStart: Date): Promise<ApiUsageDayRow[]> {
    return db
      .select({ day: apiUsageDaily.day, requests: apiUsageDaily.requests })
      .from(apiUsageDaily)
      .where(and(eq(apiUsageDaily.tenantId, tenantId), eq(apiUsageDaily.cycleStart, cycleStart)))
      .orderBy(asc(apiUsageDaily.day));
  }

  /** RTE-11, PLN-15: changes the cycle's warning or pack figures. */
  async updateCycle(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    values: Partial<CyclePackFields & { warnedPercent: number }>,
  ): Promise<void> {
    await db
      .update(apiUsage)
      .set(values)
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)));
  }

  /** The shop's cycle, made at nothing used if it has none yet, and locked for a change to its packs. */
  async lockCycle(db: Executor, tenantId: string, cycleStart: Date): Promise<ApiUsageRow> {
    await db.insert(apiUsage).values({ tenantId, cycleStart }).onConflictDoNothing();
    const [row] = await db
      .select(ROW)
      .from(apiUsage)
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)))
      .for('update');
    if (!row) throw new Error('no api usage row after making it');
    return row;
  }

  /** RTE-11: what the shop's cycles took from its request packs. */
  async packUsedTotals(db: Executor, tenantId?: string): Promise<TenantTotal[]> {
    return db
      .select({
        tenantId: apiUsage.tenantId,
        units: sql<number>`SUM(${apiUsage.packUsed})::bigint`.mapWith(Number),
      })
      .from(apiUsage)
      .where(tenantId === undefined ? undefined : eq(apiUsage.tenantId, tenantId))
      .groupBy(apiUsage.tenantId);
  }

  async find(db: Executor, tenantId: string, cycleStart: Date): Promise<ApiUsageRow | null> {
    const rows = await db
      .select(ROW)
      .from(apiUsage)
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** RTE-12: records that the cycle's fast-spend alert went out. */
  async setFastSpendAlerted(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    at: Date,
  ): Promise<void> {
    await db
      .update(apiUsage)
      .set({ fastSpendAlertedAt: at })
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)));
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
