import { and, asc, eq, gte, sql } from 'drizzle-orm';
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
  billable: apiUsage.billable,
  billedBlocks: apiUsage.billedBlocks,
  charged: apiUsage.charged,
  chargeWarned: apiUsage.chargeWarned,
};

/** One shop's requests in one billing cycle, as the database holds them. */
export interface ApiUsageRow extends CyclePackFields {
  tenantId: string;
  cycleStart: Date;
  requests: number;
  warnedPercent: number;
  /** RTE-12: when the last fast-spend alert of the cycle went out, if one did. */
  fastSpendAlertedAt: Date | null;
  /** PYG-26 (PF-14, PF-37): the cycle's successful answers; whole 1,000s charged and what they came to; warned. */
  billable: number;
  billedBlocks: number;
  charged: string;
  chargeWarned: number;
}

/** A shop's requests on one Asia/Dhaka day of a cycle (YYYY-MM-DD). */
export interface ApiUsageDayRow {
  day: string;
  requests: number;
  /** PYG-26 (PF-36): the day's successful answers and its charge. */
  billable: number;
  charged: string;
}

/** What one server counted for a shop's cycle since it last added its counts. */
export interface ApiUsageCounts {
  requests: number;
  /** RTE-06: the requests the per-visitor limit refused, and the visitors they came from not counted before. */
  refusedRequests: number;
  refusedVisitors: number;
  /** RTE-08: the orders the shop's per-minute window refused. */
  refusedOrders: number;
  /** RTE-08 (amended 2026-10-31): the payment sessions the shop's per-minute window refused. */
  refusedSessions: number;
  /** PYG-26 (PF-37): the requests answered with success (2xx or 304), the only ones pay-as-you-go is charged for. */
  billable?: number;
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
    const billable = counts.billable ?? 0;
    if (counts.requests > 0 || billable > 0) {
      await db
        .insert(apiUsageDaily)
        .values({ tenantId, cycleStart, day, requests: counts.requests, billable })
        .onConflictDoUpdate({
          target: [apiUsageDaily.tenantId, apiUsageDaily.cycleStart, apiUsageDaily.day],
          set: {
            requests: sql`${apiUsageDaily.requests} + ${counts.requests}`,
            billable: sql`${apiUsageDaily.billable} + ${billable}`,
          },
        });
    }
    const [row] = await db
      .insert(apiUsage)
      .values({ tenantId, cycleStart, ...counts, billable })
      .onConflictDoUpdate({
        target: [apiUsage.tenantId, apiUsage.cycleStart],
        set: {
          requests: sql`${apiUsage.requests} + ${counts.requests}`,
          refusedRequests: sql`${apiUsage.refusedRequests} + ${counts.refusedRequests}`,
          refusedVisitors: sql`${apiUsage.refusedVisitors} + ${counts.refusedVisitors}`,
          refusedOrders: sql`${apiUsage.refusedOrders} + ${counts.refusedOrders}`,
          refusedSessions: sql`${apiUsage.refusedSessions} + ${counts.refusedSessions}`,
          billable: sql`${apiUsage.billable} + ${billable}`,
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
      .select({
        day: apiUsageDaily.day,
        requests: apiUsageDaily.requests,
        billable: apiUsageDaily.billable,
        charged: apiUsageDaily.charged,
      })
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

  /** PYG-13 as amended (PF-38): the shop's own website's requests, and the successful ones, on the days since `fromDay`. */
  async sinceDay(
    db: Executor,
    tenantId: string,
    fromDay: string,
  ): Promise<{ requests: number; billable: number }> {
    const [row] = await db
      .select({
        requests: sql<number>`coalesce(sum(${apiUsageDaily.requests}), 0)::bigint`.mapWith(Number),
        billable: sql<number>`coalesce(sum(${apiUsageDaily.billable}), 0)::bigint`.mapWith(Number),
      })
      .from(apiUsageDaily)
      .where(and(eq(apiUsageDaily.tenantId, tenantId), gte(apiUsageDaily.day, fromDay)));
    return row ?? { requests: 0, billable: 0 };
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

  /**
   * PYG-26 (PF-14): a day's charge for the cycle's whole 1,000s past the free allowance -- added to the cycle's and the
   * day's figures in the charge's own transaction.
   */
  async recordCharge(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    day: string,
    blocks: number,
    amount: string,
  ): Promise<void> {
    await db
      .update(apiUsage)
      .set({
        billedBlocks: sql`${apiUsage.billedBlocks} + ${blocks}`,
        charged: sql`${apiUsage.charged} + ${amount}`,
      })
      .where(and(eq(apiUsage.tenantId, tenantId), eq(apiUsage.cycleStart, cycleStart)));
    await db
      .insert(apiUsageDaily)
      .values({ tenantId, cycleStart, day, charged: amount })
      .onConflictDoUpdate({
        target: [apiUsageDaily.tenantId, apiUsageDaily.cycleStart, apiUsageDaily.day],
        set: { charged: sql`${apiUsageDaily.charged} + ${amount}` },
      });
  }

  /** PYG-26 (PF-36): the furthest charge warning sent for the cycle, so each goes once. */
  async setChargeWarned(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    level: number,
  ): Promise<void> {
    await db
      .update(apiUsage)
      .set({ chargeWarned: level })
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
