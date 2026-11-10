import { and, asc, desc, gte, inArray, lt, lte, max, min, sql } from 'drizzle-orm';
import { mediaBandwidthDaily, mediaCostAlerts, mediaCostDays, tenants } from '../../schema';
import type { Executor } from '../../transactions';

/** MED-12, D8-57: one bucket's R2 figures on one UTC day, as Cloudflare's analytics gave them. */
export interface MediaCostDayRow {
  day: string;
  bucket: string;
  classA: number;
  classB: number;
  freeOps: number;
  peakBytes: number;
  objects: number;
}

/** What the media Worker answered and sent in a span of days, every shop together. */
export interface WorkerUse {
  requests: number;
  bytes: number;
}

/** A shop the media Worker answered most for, with its own figures (D8-64). */
export interface MediaShopUse extends WorkerUse {
  tenantId: string;
  name: string;
  slug: string;
}

/** The budget's alert for one billing period, once sent (D8-63). */
export interface MediaCostAlertRow {
  periodStart: string;
  sentTo: string;
  estimate: string;
  budget: string;
  sentAt: Date;
}

// MED-12, D8-57 to D8-64 (Phase 8 Slice 8.6): Cloudflare's R2 days, the Worker's use from the shops' daily bandwidth,
// and the budget's alert. Lytro's own tables, read and written outside any shop's row-level security.
export class MediaCostRepository {
  /** Replaces what an earlier read recorded for these days, so a bucket gone from a day is gone from it here too. */
  async replaceDays(
    db: Executor,
    days: readonly string[],
    rows: readonly MediaCostDayRow[],
  ): Promise<void> {
    if (days.length === 0) return;
    await db.delete(mediaCostDays).where(inArray(mediaCostDays.day, [...days]));
    if (rows.length === 0) return;
    await db.insert(mediaCostDays).values(rows.map((row) => ({ ...row, updatedAt: new Date() })));
  }

  /** The recorded days from `from` up to, not including, `to`, the earliest first. */
  async daysBetween(
    db: Executor,
    from: string,
    to: string,
  ): Promise<(MediaCostDayRow & { updatedAt: Date })[]> {
    return db
      .select({
        day: mediaCostDays.day,
        bucket: mediaCostDays.bucket,
        classA: mediaCostDays.classA,
        classB: mediaCostDays.classB,
        freeOps: mediaCostDays.freeOps,
        peakBytes: mediaCostDays.peakBytes,
        objects: mediaCostDays.objects,
        updatedAt: mediaCostDays.updatedAt,
      })
      .from(mediaCostDays)
      .where(and(gte(mediaCostDays.day, from), lt(mediaCostDays.day, to)))
      .orderBy(asc(mediaCostDays.day), asc(mediaCostDays.bucket));
  }

  /** The earliest and latest days anything was recorded for, or null with nothing yet. */
  async recordedSpan(db: Executor): Promise<{ first: string; last: string } | null> {
    const [row] = await db
      .select({ first: min(mediaCostDays.day), last: max(mediaCostDays.day) })
      .from(mediaCostDays);
    return row?.first && row.last ? { first: row.first, last: row.last } : null;
  }

  /** Every request and byte the media Worker served in these Dhaka days, `from` to `to` both included. */
  async workerUse(db: Executor, from: string, to: string): Promise<WorkerUse> {
    const [row] = await db
      .select({
        requests: sql<string>`coalesce(sum(${mediaBandwidthDaily.requests}), 0)::text`,
        bytes: sql<string>`coalesce(sum(${mediaBandwidthDaily.bytes}), 0)::text`,
      })
      .from(mediaBandwidthDaily)
      .where(and(gte(mediaBandwidthDaily.day, from), lte(mediaBandwidthDaily.day, to)));
    return { requests: Number(row?.requests ?? 0), bytes: Number(row?.bytes ?? 0) };
  }

  /** The shops the media Worker answered most for in these Dhaka days, by requests, then bytes. */
  async topShops(db: Executor, from: string, to: string, limit: number): Promise<MediaShopUse[]> {
    const requests = sql<string>`sum(${mediaBandwidthDaily.requests})`;
    const bytes = sql<string>`sum(${mediaBandwidthDaily.bytes})`;
    const rows = await db
      .select({
        tenantId: mediaBandwidthDaily.tenantId,
        name: tenants.shopName,
        slug: tenants.slug,
        requests: sql<string>`${requests}::text`,
        bytes: sql<string>`${bytes}::text`,
      })
      .from(mediaBandwidthDaily)
      .innerJoin(tenants, sql`${tenants.id} = ${mediaBandwidthDaily.tenantId}`)
      .where(and(gte(mediaBandwidthDaily.day, from), lte(mediaBandwidthDaily.day, to)))
      .groupBy(mediaBandwidthDaily.tenantId, tenants.shopName, tenants.slug)
      .having(sql`${requests} > 0`)
      .orderBy(desc(requests), desc(bytes), asc(mediaBandwidthDaily.tenantId))
      .limit(limit);
    return rows.map((row) => ({
      tenantId: row.tenantId,
      name: row.name,
      slug: row.slug,
      requests: Number(row.requests),
      bytes: Number(row.bytes),
    }));
  }

  /** Records the period's alert; false when one was already sent for it, so it goes once. */
  async recordAlert(db: Executor, alert: Omit<MediaCostAlertRow, 'sentAt'>): Promise<boolean> {
    const rows = await db
      .insert(mediaCostAlerts)
      .values(alert)
      .onConflictDoNothing({ target: mediaCostAlerts.periodStart })
      .returning({ periodStart: mediaCostAlerts.periodStart });
    return rows.length > 0;
  }

  async alertOf(db: Executor, periodStart: string): Promise<MediaCostAlertRow | null> {
    const [row] = await db
      .select()
      .from(mediaCostAlerts)
      .where(sql`${mediaCostAlerts.periodStart} = ${periodStart}`);
    return row ?? null;
  }
}
