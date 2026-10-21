import { and, asc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { PlanLimits, TenantState } from '@lytronix/validators';
import { mediaBandwidth, mediaBandwidthDaily, mediaUsagePull, tenants } from '../../schema';
import type { Executor } from '../../transactions';

/** One shop's media bandwidth in one billing cycle, as the database holds it. */
export interface BandwidthCycleRow {
  tenantId: string;
  cycleStart: Date;
  bytes: number;
  requests: number;
  warnedPercent: number;
}

/** BND-08: one Dhaka calendar day of a shop's media bandwidth. */
export interface BandwidthDayRow {
  day: string;
  bytes: number;
  requests: number;
}

/** What the minute's pass needs about each shop: its cycle, its limits, whether it is offline, its address. */
export interface EdgeShopRow {
  id: string;
  slug: string;
  state: TenantState;
  suspendedAt: Date | null;
  periodStart: Date | null;
  createdAt: Date;
  planSnapshot: PlanLimits | null;
  deletedAt: Date | null;
}

const CYCLE = {
  tenantId: mediaBandwidth.tenantId,
  cycleStart: mediaBandwidth.cycleStart,
  bytes: mediaBandwidth.bytes,
  requests: mediaBandwidth.requests,
  warnedPercent: mediaBandwidth.warnedPercent,
};

// BND-01, BND-02, BND-05, BND-06, BND-08: each shop's media bandwidth per billing cycle and per day, totalled every
// minute from the media Worker's usage, and how far that usage has been totalled.
export class MediaBandwidthRepository {
  /** BND-02: how far the Worker's usage is totalled, locked, so two runs never total the same minutes twice. */
  async lockPulledUntil(db: Executor): Promise<Date> {
    const rows = await db
      .select({ pulledUntil: mediaUsagePull.pulledUntil })
      .from(mediaUsagePull)
      .where(eq(mediaUsagePull.id, 1))
      .for('update');
    const row = rows[0];
    if (!row) throw new Error('control.media_usage_pull has no row; migration 0067 seeds it');
    return row.pulledUntil;
  }

  async setPulledUntil(db: Executor, at: Date): Promise<void> {
    await db.update(mediaUsagePull).set({ pulledUntil: at }).where(eq(mediaUsagePull.id, 1));
  }

  /** Adds usage to the shop's cycle and to its day; the cycle's totals as they now are. */
  async add(
    db: Executor,
    usage: { tenantId: string; cycleStart: Date; day: string; bytes: number; requests: number },
  ): Promise<BandwidthCycleRow> {
    const { tenantId, cycleStart, day, bytes, requests } = usage;
    await db
      .insert(mediaBandwidthDaily)
      .values({ tenantId, cycleStart, day, bytes, requests })
      .onConflictDoUpdate({
        target: [
          mediaBandwidthDaily.tenantId,
          mediaBandwidthDaily.cycleStart,
          mediaBandwidthDaily.day,
        ],
        set: {
          bytes: sql`${mediaBandwidthDaily.bytes} + ${bytes}`,
          requests: sql`${mediaBandwidthDaily.requests} + ${requests}`,
        },
      });
    const [row] = await db
      .insert(mediaBandwidth)
      .values({ tenantId, cycleStart, bytes, requests })
      .onConflictDoUpdate({
        target: [mediaBandwidth.tenantId, mediaBandwidth.cycleStart],
        set: {
          bytes: sql`${mediaBandwidth.bytes} + ${bytes}`,
          requests: sql`${mediaBandwidth.requests} + ${requests}`,
          updatedAt: new Date(),
        },
      })
      .returning(CYCLE);
    if (!row) throw new Error('upsert returned no media bandwidth row');
    return row;
  }

  /** BND-05: records the highest warning sent for the cycle, so each is sent once. */
  async setWarned(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
    percent: number,
  ): Promise<void> {
    await db
      .update(mediaBandwidth)
      .set({ warnedPercent: percent })
      .where(and(eq(mediaBandwidth.tenantId, tenantId), eq(mediaBandwidth.cycleStart, cycleStart)));
  }

  async findCycle(
    db: Executor,
    tenantId: string,
    cycleStart: Date,
  ): Promise<BandwidthCycleRow | null> {
    const rows = await db
      .select(CYCLE)
      .from(mediaBandwidth)
      .where(and(eq(mediaBandwidth.tenantId, tenantId), eq(mediaBandwidth.cycleStart, cycleStart)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** BND-03: every shop's cycles that started since this time, to find the ones at their limit. */
  async listCyclesSince(db: Executor, since: Date): Promise<BandwidthCycleRow[]> {
    return db.select(CYCLE).from(mediaBandwidth).where(gte(mediaBandwidth.cycleStart, since));
  }

  /** BND-08: the days of the shop's cycle, in order; together they total the cycle's row. */
  async listDays(db: Executor, tenantId: string, cycleStart: Date): Promise<BandwidthDayRow[]> {
    return db
      .select({
        day: mediaBandwidthDaily.day,
        bytes: mediaBandwidthDaily.bytes,
        requests: mediaBandwidthDaily.requests,
      })
      .from(mediaBandwidthDaily)
      .where(
        and(
          eq(mediaBandwidthDaily.tenantId, tenantId),
          eq(mediaBandwidthDaily.cycleStart, cycleStart),
        ),
      )
      .orderBy(asc(mediaBandwidthDaily.day));
  }

  /**
   * MED-10, MED-13: every shop not deleted, or deleted since `deletedSince`, with what the media Worker's shared store
   * is worked out from.
   */
  async listEdgeShops(db: Executor, deletedSince: Date): Promise<EdgeShopRow[]> {
    return db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        periodStart: tenants.periodStart,
        createdAt: tenants.createdAt,
        planSnapshot: tenants.planSnapshot,
        deletedAt: tenants.deletedAt,
      })
      .from(tenants)
      .where(or(isNull(tenants.deletedAt), gte(tenants.deletedAt, deletedSince)));
  }

  /** LIF-19: a lapsed shop's bandwidth, at day 60. */
  async deleteAllForTenant(db: Executor, tenantId: string): Promise<void> {
    await db.delete(mediaBandwidthDaily).where(eq(mediaBandwidthDaily.tenantId, tenantId));
    await db.delete(mediaBandwidth).where(eq(mediaBandwidth.tenantId, tenantId));
  }
}
