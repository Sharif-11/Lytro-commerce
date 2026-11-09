import { and, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';
import {
  IdentityKind,
  PlanPaymentKind,
  PlanPaymentStatus,
  TenantState,
} from '@lytronix/validators';
import type { Executor } from '../../transactions';
import {
  mediaBandwidthDaily,
  planPayments,
  plans,
  subscriberIdentities,
  tenants,
} from '../../schema';
import type { ShopFigure } from './shop-day.repository';

/** A shop as a report names it, with its owner's phone (D8-42). */
export interface ReportShopRow {
  id: string;
  name: string;
  slug: string;
  ownerPhone: string | null;
}

/** A count of shops in one state on one plan, now. */
export interface ShopCountRow {
  state: TenantState;
  planId: string | null;
  planName: string | null;
  count: number;
}

// The day an instant falls on in Asia/Dhaka, as the reports' periods count days.
const dhakaDay = (column: unknown) =>
  sql<string>`to_char((${column} AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD')`;

// ADM-09, D8-10, D8-40 to D8-42 (Phase 8 Slice 8.4): the reports' figures from Lytro's own tables -- payments to Lytro,
// the shops themselves, media bandwidth -- never a shop's own rows. What shops spent from their balances comes from
// their recorded days (ShopDayRepository).
export class ReportsRepository {
  /**
   * D8-40: what reached Lytro's wallets for a plan or an add-on each day, by kind -- a purchase, renewal, upgrade or
   * add-on paid with a transaction ID and verified. A top-up isn't earned until it is spent, and a payment from the
   * balance is counted as balance spending, so neither is here.
   */
  async walletEarnedByDay(
    db: Executor,
    from: Date,
    to: Date,
  ): Promise<{ day: string; kind: PlanPaymentKind; amount: string }[]> {
    const day = dhakaDay(planPayments.verifiedAt);
    return db
      .select({
        day,
        kind: planPayments.kind,
        amount: sql<string>`sum(${planPayments.amount})::numeric(14, 2)::text`,
      })
      .from(planPayments)
      .where(
        and(
          eq(planPayments.status, PlanPaymentStatus.Verified),
          isNotNull(planPayments.transactionId),
          ne(planPayments.kind, PlanPaymentKind.TopUp),
          gte(planPayments.verifiedAt, from),
          lt(planPayments.verifiedAt, to),
        ),
      )
      .groupBy(day, planPayments.kind)
      .orderBy(day, planPayments.kind);
  }

  /** D8-41: the shops opened each day. */
  async openedByDay(db: Executor, from: Date, to: Date): Promise<{ day: string; count: number }[]> {
    const day = dhakaDay(tenants.createdAt);
    const rows = await db
      .select({ day, count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(and(gte(tenants.createdAt, from), lt(tenants.createdAt, to)))
      .groupBy(day)
      .orderBy(day);
    return rows;
  }

  /** D8-41: the shops that first paid for a plan each day -- a trial, or a shop that never paid, becoming paying. */
  async firstPaidByDay(
    db: Executor,
    from: Date,
    to: Date,
  ): Promise<{ day: string; count: number }[]> {
    const result = await db.execute<{ day: string; count: string }>(sql`
      SELECT to_char((first_paid AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS day, count(*)::text AS count
      FROM (
        SELECT tenant_id, min(verified_at) AS first_paid
        FROM ${planPayments}
        WHERE kind = ${PlanPaymentKind.Purchase} AND status = ${PlanPaymentStatus.Verified}
        GROUP BY tenant_id
      ) firsts
      WHERE first_paid >= ${from} AND first_paid < ${to}
      GROUP BY 1
      ORDER BY 1`);
    return result.rows.map((row) => ({ day: row.day, count: Number(row.count) }));
  }

  /** D8-41: the shops by state and plan now, a deleted one left out. */
  async countsNow(db: Executor): Promise<ShopCountRow[]> {
    const rows = await db
      .select({
        state: tenants.state,
        planId: tenants.planId,
        planName: plans.name,
        count: sql<number>`count(*)::int`,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(ne(tenants.state, TenantState.Deleted))
      .groupBy(tenants.state, tenants.planId, plans.name)
      .orderBy(tenants.state, plans.name);
    return rows;
  }

  /** D8-10: the shops whose media was served the most in the period, in bytes. */
  async bandwidthTop(db: Executor, from: string, to: string, limit: number): Promise<ShopFigure[]> {
    const bytes = sql<string>`sum(${mediaBandwidthDaily.bytes})::text`;
    const rows = await db
      .select({ tenantId: mediaBandwidthDaily.tenantId, value: bytes })
      .from(mediaBandwidthDaily)
      .where(and(gte(mediaBandwidthDaily.day, from), lte(mediaBandwidthDaily.day, to)))
      .groupBy(mediaBandwidthDaily.tenantId)
      .having(sql`sum(${mediaBandwidthDaily.bytes}) > 0`)
      .orderBy(sql`sum(${mediaBandwidthDaily.bytes}) DESC`, mediaBandwidthDaily.tenantId)
      .limit(limit);
    return rows.map((row) => ({ tenantId: row.tenantId, value: Number(row.value) }));
  }

  /** The shops a report names, with each owner's phone (D8-42); a shop with no phone on record gives null. */
  async shopsByIds(db: Executor, ids: readonly string[]): Promise<ReportShopRow[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.shopName,
        slug: tenants.slug,
        ownerPhone: subscriberIdentities.value,
      })
      .from(tenants)
      .leftJoin(
        subscriberIdentities,
        and(
          eq(subscriberIdentities.subscriberId, tenants.subscriberId),
          eq(subscriberIdentities.kind, IdentityKind.Phone),
        ),
      )
      .where(inArray(tenants.id, [...ids]));
    // An owner may have more than one phone on record: the first found is enough to call.
    const byId = new Map<string, ReportShopRow>();
    for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
    return [...byId.values()];
  }
}
