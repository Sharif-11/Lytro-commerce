import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notIlike,
  or,
  lte,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '../../client';
import type { PlanStanding } from '../../schema';
import type { Executor } from '../../transactions';
import { escapeLike } from '../like';
import { plans, subscriberIdentities, tenantDomains, tenants } from '../../schema';
import {
  DomainStatus,
  KycStatus,
  IdentityKind,
  TenantSort,
  TenantState,
  shopLimitsOf,
  type PhoneSearch,
  type PlanLimits,
} from '@lytronix/validators';
import { addonUnitList, addonUnitsOf } from '../billing/addon-purchase.repository';

// LIF-21: "the old subdomain shall stay reserved for 30 days" after deletion.
const SLUG_RESERVATION_MS = 30 * 24 * 60 * 60 * 1000;

// Shop rows and their lookups. The trial period and plan choice are decided by the tenancy service.
export interface TenantLookupRow {
  suspendedAt: Date | null;
  id: string;
  slug: string;
  state: (typeof tenants.$inferSelect)['state'];
}

/** What the dashboard shell and the lifecycle gate need about a shop. */
export interface TenantSummaryRow {
  id: string;
  slug: string;
  shopName: string;
  state: TenantLookupRow['state'];
  suspendedAt: Date | null;
  planId: string | null;
  planName: string | null;
  /** PLN-02: the version of its plan the shop bought. */
  planVersion: number | null;
  /** PLN-11: how many overrides the shop has. */
  overrideCount: number;
  /** PLN-05, PLN-06, PLN-11, PLN-13: the shop's own limits: its plan snapshot, its overrides, its active add-ons. */
  planLimits: PlanLimits | null;
  /** UPG-10, PYG-19: with the state and creation date, what the shop's usage cycles are counted from. */
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
  /** TEN-31: the account that owns the shop, for the dashboard's membership check. */
  ownerSubscriberId: string;
  /** PST-01: the shop's main business type (a preset key), which sets new products' defaults; null until chosen. */
  businessType: string | null;
  /** BIL-17: whether the plan renews itself from the balance at the period's end. */
  autoRenewEnabled: boolean;
}

// PLN-11: a shop's overrides as one object, read with the shop itself. A select using this or `addonUnitsOf(tenants.id)`
// must join another table: from one table alone, Drizzle writes `tenants.id` as a bare "id", which the subquery reads as
// its own table's id, and it silently finds nothing.
const overridesOfShop = sql<Record<string, unknown> | null>`(
  SELECT jsonb_object_agg(o.limit_key, o.value)
  FROM control.plan_limit_overrides o
  WHERE o.tenant_id = ${tenants.id}
)`;

/**
 * PLN-05, PLN-06, PLN-13: the limits a shop is held to are the snapshot frozen when it bought its plan, never the live
 * plan's, which an operator's edit would otherwise change in the middle of a period already paid for -- with its
 * overrides over it, and its active add-ons on top.
 */
function limitsOf(
  snapshot: PlanLimits | null,
  overrides: Record<string, unknown> | null,
  addons: Record<string, number> | null,
): PlanLimits | null {
  const list = Object.entries(overrides ?? {}).map(([limitKey, value]) => ({ limitKey, value }));
  return shopLimitsOf(snapshot, list, addonUnitList(addons));
}

/** A summary as read, with the shop's own limits worked out from its snapshot, overrides and add-ons. */
function summaryOf<
  R extends {
    planSnapshot: PlanLimits | null;
    overrides: Record<string, unknown> | null;
    addons: Record<string, number> | null;
  },
>(
  row: R,
): Omit<R, 'planSnapshot' | 'overrides' | 'addons'> & {
  planLimits: PlanLimits | null;
  overrideCount: number;
} {
  const { planSnapshot, overrides, addons, ...rest } = row;
  return {
    ...rest,
    planLimits: limitsOf(planSnapshot, overrides, addons),
    overrideCount: Object.keys(overrides ?? {}).length,
  };
}

// ADM-02, D8-7: the operator's own keyset cursor for search(), one shape per sort -- the last shop the caller has
// already seen, with the id breaking ties as the audit log's own cursor does.
export type TenantSearchCursor =
  | { sort: TenantSort.Newest; createdAt: Date; id: string }
  | { sort: TenantSort.Name; name: string; id: string }
  | { sort: TenantSort.PeriodEnd; periodEnd: Date | null; id: string };

/** ADM-02, D8-7: what the operator's shop list narrows by. */
export interface TenantSearchFilters {
  query: string | null;
  /** D8-24: the query read as the owner's phone, when it is one. */
  phone: PhoneSearch | null;
  state: TenantState | null;
  planId: string | null;
}

export type TenantSearchRow = TenantSummaryRow & {
  /** D8-24: the owner's phone, the one the shop was made with. */
  ownerPhone: string | null;
  /** The shop's name as the database orders it, for the name sort's cursor. */
  sortName: string;
};

/** OPERATOR-CONSOLE-DESIGN §5: a shop's suspensions, its new-shop cap, and the parts of its limits. */
export interface TenantOperatorFactsRow {
  planVersion: number | null;
  planSnapshot: PlanLimits | null;
  overrides: Record<string, unknown> | null;
  addons: Record<string, number> | null;
  suspendedReason: string | null;
  paymentPageSuspendedAt: Date | null;
  paymentPageSuspendedReason: string | null;
  newShopCap: boolean | null;
}

export class TenantRepository {
  /** INV-13, INV-16, MED-04: every shop not yet deleted, for the daily passes that visit each one. */
  async listLiveIds(db: Executor): Promise<string[]> {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(isNull(tenants.deletedAt))
      .orderBy(asc(tenants.id));
    return rows.map((row) => row.id);
  }

  async findSummaryById(db: Database, id: string): Promise<TenantSummaryRow | null> {
    const rows = await this.summaryQuery(db).where(eq(tenants.id, id)).limit(1);
    return rows[0] ? summaryOf(rows[0]) : null;
  }

  /** OPERATOR-CONSOLE-DESIGN §5: what the operator's shop page reads beyond a summary. */
  async findOperatorFacts(db: Database, id: string): Promise<TenantOperatorFactsRow | null> {
    const rows = await db
      .select({
        planVersion: tenants.planVersionSnapshot,
        planSnapshot: tenants.planSnapshot,
        overrides: overridesOfShop,
        addons: addonUnitsOf(tenants.id),
        suspendedReason: tenants.suspendedReason,
        paymentPageSuspendedAt: tenants.paymentPageSuspendedAt,
        paymentPageSuspendedReason: tenants.paymentPageSuspendedReason,
        newShopCap: tenants.newShopCap,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** TEN-31: the shop a dashboard page names by its slug. */
  async findSummaryBySlug(db: Database, slug: string): Promise<TenantSummaryRow | null> {
    const rows = await this.summaryQuery(db).where(eq(tenants.slug, slug)).limit(1);
    return rows[0] ? summaryOf(rows[0]) : null;
  }

  private summaryQuery(db: Database) {
    return db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        shopName: tenants.shopName,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        planId: tenants.planId,
        planName: plans.name,
        planVersion: tenants.planVersionSnapshot,
        planSnapshot: tenants.planSnapshot,
        overrides: overridesOfShop,
        addons: addonUnitsOf(tenants.id),
        periodStart: tenants.periodStart,
        periodEnd: tenants.periodEnd,
        createdAt: tenants.createdAt,
        ownerSubscriberId: tenants.subscriberId,
        businessType: tenants.businessType,
        autoRenewEnabled: tenants.autoRenewEnabled,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId));
  }

  /**
   * ADM-02, D8-7: the operator's shop list, by shop name or address substring (a typed `%` or `_` matched as itself) or
   * the owner's phone (D8-24), narrowed by state and plan, in one of three orders. Never OFFSET: each order pages on its
   * own keyset. Pass `limit + 1` to learn whether another page exists (AuditService.list's own trick).
   */
  async search(
    db: Database,
    filters: TenantSearchFilters,
    sort: TenantSort,
    cursor: TenantSearchCursor | null,
    limit: number,
  ): Promise<TenantSearchRow[]> {
    const sortName = sql<string>`lower(${tenants.shopName})`;
    const conditions = [];
    if (filters.query) {
      const pattern = `%${escapeLike(filters.query)}%`;
      const phone = filters.phone;
      conditions.push(
        or(
          ilike(tenants.shopName, pattern),
          ilike(tenants.slug, pattern),
          phone === null
            ? undefined
            : 'exact' in phone
              ? eq(subscriberIdentities.value, phone.exact)
              : sql`${subscriberIdentities.value} LIKE ${`%${escapeLike(phone.ending)}`}`,
        ),
      );
    }
    if (filters.state) conditions.push(eq(tenants.state, filters.state));
    if (filters.planId) conditions.push(eq(tenants.planId, filters.planId));
    if (cursor) conditions.push(this.afterCursor(cursor, sortName));
    const order =
      sort === TenantSort.Name
        ? [asc(sortName), asc(tenants.id)]
        : sort === TenantSort.PeriodEnd
          ? [sql`${tenants.periodEnd} ASC NULLS LAST`, asc(tenants.id)]
          : [desc(tenants.createdAt), desc(tenants.id)];
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        shopName: tenants.shopName,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        planId: tenants.planId,
        planName: plans.name,
        planVersion: tenants.planVersionSnapshot,
        planSnapshot: tenants.planSnapshot,
        overrides: overridesOfShop,
        addons: addonUnitsOf(tenants.id),
        periodStart: tenants.periodStart,
        periodEnd: tenants.periodEnd,
        createdAt: tenants.createdAt,
        ownerSubscriberId: tenants.subscriberId,
        businessType: tenants.businessType,
        autoRenewEnabled: tenants.autoRenewEnabled,
        ownerPhone: subscriberIdentities.value,
        sortName,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .leftJoin(
        subscriberIdentities,
        and(
          eq(subscriberIdentities.id, tenants.ownerIdentityId),
          eq(subscriberIdentities.kind, IdentityKind.Phone),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...order)
      .limit(limit);
    return rows.map(summaryOf);
  }

  /** The shops after the cursor's, in its own sort's order. */
  private afterCursor(cursor: TenantSearchCursor, sortName: SQL<string>) {
    if (cursor.sort === TenantSort.Name) {
      return or(
        sql`${sortName} > ${cursor.name}`,
        and(sql`${sortName} = ${cursor.name}`, gt(tenants.id, cursor.id)),
      );
    }
    if (cursor.sort === TenantSort.PeriodEnd) {
      // NULLS LAST: after a dated shop come later dates, then every undated one; after an undated one, only undated.
      return cursor.periodEnd === null
        ? and(isNull(tenants.periodEnd), gt(tenants.id, cursor.id))
        : or(
            gt(tenants.periodEnd, cursor.periodEnd),
            and(eq(tenants.periodEnd, cursor.periodEnd), gt(tenants.id, cursor.id)),
            isNull(tenants.periodEnd),
          );
    }
    return or(
      lt(tenants.createdAt, cursor.createdAt),
      and(eq(tenants.createdAt, cursor.createdAt), lt(tenants.id, cursor.id)),
    );
  }

  /**
   * ADM-04, D8-12: the shop's period ends later. `restore` brings a lapsed shop back to active and clears what its
   * lapse froze, as a plan assignment does (LIF-15, LIF-26).
   */
  async extendPeriod(tx: Executor, id: string, periodEnd: Date, restore: boolean): Promise<void> {
    await tx
      .update(tenants)
      .set({
        periodEnd,
        ...(restore
          ? { state: TenantState.Active, lapseScheduleSnapshot: null, archivedAt: null }
          : {}),
      })
      .where(eq(tenants.id, id));
  }

  /** Finds a shop by its address label, e.g. `fashion-house` for fashion-house.<platform domain>. */
  async findBySlug(db: Database, slug: string): Promise<TenantLookupRow | null> {
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * The shop that owns a verified, active custom domain, by its name or by its twin while the twin's record points here
   * (Slice 13). Waiting, failed and removed domains never match (TEN-12); whether the shop's plan lets an active one
   * serve is the caller's to decide (DWN-10).
   */
  async findByActiveDomain(db: Database, hostname: string): Promise<TenantLookupRow | null> {
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
      })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
      .where(
        and(
          eq(tenantDomains.status, DomainStatus.Active),
          or(
            eq(tenantDomains.hostname, hostname),
            and(eq(tenantDomains.twin, hostname), eq(tenantDomains.twinActive, true)),
          ),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(
    db: Executor,
    values: {
      ownerIdentityId: string;
      subscriberId: string;
      shopName: string;
      slug: string;
      planId: string;
      planSnapshot: PlanLimits;
      periodStart: Date;
      periodEnd: Date;
    },
  ): Promise<string> {
    const [row] = await db.insert(tenants).values(values).returning({ id: tenants.id });
    if (!row) throw new Error('insert returned no tenant');
    return row.id;
  }

  /** A plan offered for sale or not, by name. Used to find the Trial plan (D3). */
  async findPlanByName(
    db: Executor,
    name: string,
    forSale: boolean,
  ): Promise<{
    id: string;
    limits: PlanLimits;
    version: number;
    features: Record<string, boolean>;
  } | null> {
    const rows = await db
      .select({
        id: plans.id,
        limits: plans.limits,
        version: plans.version,
        features: plans.features,
      })
      .from(plans)
      .where(and(eq(plans.name, name), eq(plans.forSale, forSale)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Locks the tenant's row for the rest of the transaction (BAL-11) and returns its current balance. Must run
   * inside a transaction that commits or rolls back promptly — the lock holds until then.
   */
  async lockBalanceForUpdate(tx: Executor, tenantId: string): Promise<BalanceRow | null> {
    const rows = await tx
      .select({
        amount: tenants.balanceAmount,
        frozen: tenants.balanceFrozen,
        state: tenants.state,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for('update');
    return rows[0] ?? null;
  }

  /** BAL-01: the balance as last committed, for a reader. Takes no lock, so it never waits behind a charge. */
  async findBalance(tx: Executor, tenantId: string): Promise<BalanceRow | null> {
    const rows = await tx
      .select({
        amount: tenants.balanceAmount,
        frozen: tenants.balanceFrozen,
        state: tenants.state,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return rows[0] ?? null;
  }

  /** BAL-07/08/09: freezes or unfreezes the balance without touching its amount. */
  async setBalanceFrozen(tx: Executor, tenantId: string, frozen: boolean): Promise<void> {
    await tx.update(tenants).set({ balanceFrozen: frozen }).where(eq(tenants.id, tenantId));
  }

  /**
   * D2-11: the cached last-activity timestamp a pay-as-you-go charge or top-up moves. The balance itself is never
   * written here: a balance-ledger entry moves it, and the database refuses any other change (BAL-02).
   */
  async touchActivity(tx: Executor, tenantId: string, at: Date): Promise<void> {
    await tx.update(tenants).set({ lastActivityAt: at }).where(eq(tenants.id, tenantId));
  }

  /**
   * PLN-17/TRL-07: activates a plan assignment (not-for-sale operator override, or the trial-end conversion
   * to pay-as-you-go), storing a normal snapshot exactly as a purchase would. `periodEnd: null` means no
   * expiry (PLN-18, PYG-08) -- the lifecycle job (slice 7) must treat a plan with no period end as never
   * lapsing, the same way it already will for an expiring one that hasn't lapsed. `state` is the caller's to
   * decide (Active for an operator override, PayAsYouGo for the trial-end conversion) -- this method only
   * writes, it never infers it.
   */
  async applyPlanAssignment(
    tx: Executor,
    tenantId: string,
    values: {
      planId: string;
      planSnapshot: PlanLimits;
      // PLN-05: "plan ID and version, all limits and features" -- the rest of the purchase snapshot,
      // frozen alongside planSnapshot so a later edit to the live plan row never changes what an existing
      // tenant is recorded as having actually bought.
      planVersionSnapshot: number;
      featureSnapshot: Record<string, boolean>;
      periodStart: Date;
      periodEnd: Date | null;
      state: TenantState;
      // BIL-17: omitted (not just `undefined`) leaves the tenant's currently-stored term untouched -- a
      // downgrade doesn't change the billing term, only a purchase/renewal/upgrade picks one.
      billingTermId?: string | null;
    },
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({
        planId: values.planId,
        planSnapshot: values.planSnapshot,
        planVersionSnapshot: values.planVersionSnapshot,
        featureSnapshot: values.featureSnapshot,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        state: values.state,
        // LIF-26: returning to active clears any frozen lapse schedule -- the *next* lapse (a new period
        // ending in the future) snapshots whatever the platform settings say at that later moment, not the
        // one this tenant happened to start with last time.
        lapseScheduleSnapshot: null,
        archivedAt: null, // LIF-15: a plan or pay-as-you-go always leaves `archived`
        // DWN-12: a new plan starts without a downgrade's checklist; a downgrade records its own after this.
        downgradedAt: null,
        downgradeOverLimit: null,
        downgradeFinalWarningAt: null,
        ...(values.billingTermId !== undefined ? { billingTermId: values.billingTermId } : {}),
      })
      .where(eq(tenants.id, tenantId));
  }

  /**
   * ADM-15, D8-48: everything a plan payment changes on a shop, held for the rest of the transaction: kept with a manual
   * entry, so a reversal can put the shop back exactly as it stood.
   */
  async planStanding(tx: Executor, id: string): Promise<PlanStanding | null> {
    const rows = await tx
      .select({
        state: tenants.state,
        planId: tenants.planId,
        planSnapshot: tenants.planSnapshot,
        planVersionSnapshot: tenants.planVersionSnapshot,
        featureSnapshot: tenants.featureSnapshot,
        periodStart: tenants.periodStart,
        periodEnd: tenants.periodEnd,
        billingTermId: tenants.billingTermId,
        cancelledAt: tenants.cancelledAt,
        archivedAt: tenants.archivedAt,
        downgradedAt: tenants.downgradedAt,
        downgradeOverLimit: tenants.downgradeOverLimit,
        downgradeFinalWarningAt: tenants.downgradeFinalWarningAt,
        lapseScheduleSnapshot: tenants.lapseScheduleSnapshot,
        balanceFrozen: tenants.balanceFrozen,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .for('update');
    const row = rows[0];
    if (!row) return null;
    const iso = (date: Date | null): string | null => date?.toISOString() ?? null;
    return {
      ...row,
      periodStart: iso(row.periodStart),
      periodEnd: iso(row.periodEnd),
      cancelledAt: iso(row.cancelledAt),
      archivedAt: iso(row.archivedAt),
      downgradedAt: iso(row.downgradedAt),
      downgradeFinalWarningAt: iso(row.downgradeFinalWarningAt),
    };
  }

  /** ADM-15, D8-48: puts a shop back as `planStanding` read it. */
  async restorePlanStanding(tx: Executor, id: string, standing: PlanStanding): Promise<void> {
    const date = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));
    await tx
      .update(tenants)
      .set({
        ...standing,
        periodStart: date(standing.periodStart),
        periodEnd: date(standing.periodEnd),
        cancelledAt: date(standing.cancelledAt),
        archivedAt: date(standing.archivedAt),
        downgradedAt: date(standing.downgradedAt),
        downgradeFinalWarningAt: date(standing.downgradeFinalWarningAt),
      })
      .where(eq(tenants.id, id));
  }

  /** TRL-07: trials whose period has ended with no purchase -- the trial-end job's own candidate list. */
  async findExpiredTrialIds(tx: Executor, now: Date): Promise<string[]> {
    const rows = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.state, TenantState.Trial), lte(tenants.periodEnd, now)));
    return rows.map((row) => row.id);
  }

  /** LIF-24: an operator closing the public/dashboard side for cause, independent of `state`. */
  async setSuspension(tx: Executor, tenantId: string, reason: string, at: Date): Promise<void> {
    await tx
      .update(tenants)
      .set({ suspendedAt: at, suspendedReason: reason })
      .where(eq(tenants.id, tenantId));
  }

  /** TVR-03 (Slice 5.2b): suspends the shop's payment page alone, with Lytro's reason, or (null) lifts it. */
  async setPaymentPageSuspension(
    tx: Executor,
    tenantId: string,
    suspension: { reason: string; at: Date } | null,
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({
        paymentPageSuspendedAt: suspension?.at ?? null,
        paymentPageSuspendedReason: suspension?.reason ?? null,
      })
      .where(eq(tenants.id, tenantId));
  }

  /**
   * TVR-04 (Slice 5.3): what decides whether the new-shop cap holds the shop -- its state, when it was made, and the
   * operator's switch; null for no such shop.
   */
  async newShopOf(
    tx: Executor,
    tenantId: string,
  ): Promise<{ state: TenantState; createdAt: Date; newShopCap: boolean | null } | null> {
    const [row] = await tx
      .select({
        state: tenants.state,
        createdAt: tenants.createdAt,
        newShopCap: tenants.newShopCap,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return row ?? null;
  }

  /** TVR-04: the operator's switch for the shop's new-shop cap -- on, off, or (null) as its kind says. */
  async setNewShopCap(tx: Executor, tenantId: string, capped: boolean | null): Promise<void> {
    await tx.update(tenants).set({ newShopCap: capped }).where(eq(tenants.id, tenantId));
  }

  /** TVR-03: the shop's payment page as it stands now -- suspended since when, or null; null for no such shop. */
  async paymentPageOf(
    tx: Executor,
    tenantId: string,
  ): Promise<{ suspendedAt: Date | null } | null> {
    const [row] = await tx
      .select({ suspendedAt: tenants.paymentPageSuspendedAt })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return row ?? null;
  }

  /** LIF-15/24: lifts a suspension -- restore and operator restore both call this. */
  async clearSuspension(tx: Executor, tenantId: string): Promise<void> {
    await tx
      .update(tenants)
      .set({ suspendedAt: null, suspendedReason: null })
      .where(eq(tenants.id, tenantId));
  }

  /** LIF-01: sets or clears the owner's own non-renewal intent. */
  async setCancellation(tx: Executor, tenantId: string, cancelledAt: Date | null): Promise<void> {
    await tx.update(tenants).set({ cancelledAt }).where(eq(tenants.id, tenantId));
  }

  /**
   * LIF-03/04/23, PYG-09: the lifecycle state write -- plan, period and balance are untouched. Entering
   * `archived` records when (`at`), which a pay-as-you-go shop's deletion clock counts from.
   */
  async setLifecycleState(
    tx: Executor,
    tenantId: string,
    state: TenantState,
    at: Date,
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({ state, archivedAt: state === TenantState.Archived ? at : null })
      .where(eq(tenants.id, tenantId));
  }

  /**
   * PYG-09, LIF-24: puts a shop that an operator suspension archived back on pay-as-you-go, its idle clock
   * (PYG-21) starting again from `at`.
   */
  async returnToPayAsYouGo(tx: Executor, tenantId: string, at: Date): Promise<void> {
    await tx
      .update(tenants)
      .set({ state: TenantState.PayAsYouGo, periodStart: at, archivedAt: null })
      .where(eq(tenants.id, tenantId));
  }

  /** LIF-26: freezes today's stage lengths onto the tenant the first tick it's found lapsing. */
  async setLapseScheduleSnapshot(
    tx: Executor,
    tenantId: string,
    snapshot: StageLengthsSnapshot,
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({ lapseScheduleSnapshot: snapshot })
      .where(eq(tenants.id, tenantId));
  }

  /** LIF-19: the day-60 deletion job's own state/marker write. */
  async markDeleted(tx: Executor, tenantId: string, at: Date): Promise<void> {
    await tx
      .update(tenants)
      .set({ deletedAt: at, state: TenantState.Deleted })
      .where(eq(tenants.id, tenantId));
  }

  /** LIF-20/21: an account's deleted shops -- their invoices stay the owner's, their balance moves on. */
  async findDeletedShopsOf(tx: Executor, subscriberId: string): Promise<DeletedShopRow[]> {
    return tx
      .select({ id: tenants.id, balanceAmount: tenants.balanceAmount })
      .from(tenants)
      .where(and(eq(tenants.subscriberId, subscriberId), isNotNull(tenants.deletedAt)));
  }

  /** LIF-21: deleted tenants whose 30-day subdomain reservation has lapsed, and whose slug hasn't already
   * been revoked -- the `-revoked-` marker a prior run leaves behind is itself the idempotency check, the
   * same "the write proves it happened" pattern DWN-11's floor columns use. */
  async findRevocationCandidates(tx: Executor, now: Date): Promise<RevocationCandidateRow[]> {
    return tx
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(
        and(
          isNotNull(tenants.deletedAt),
          lt(tenants.deletedAt, new Date(now.getTime() - SLUG_RESERVATION_MS)),
          notIlike(tenants.slug, '%-revoked-%'),
        ),
      );
  }

  /** LIF-21: the shop's identity is no longer meaningful this long after deletion -- frees the literal slug
   * string for a different subscriber (the one strictly required part: `SlugRepository.findUnavailable`
   * needs no change of its own, since this is the row it already reads) and clears every other
   * identity/contact field LIF-20's own survivor list (plan, payment history, invoices, balance) doesn't
   * depend on. The database trigger (migration 0037) is what actually permits the slug write here; this
   * method doesn't special-case it. */
  async revokeExpiredTenant(tx: Executor, tenantId: string, mangledSlug: string): Promise<void> {
    await tx
      .update(tenants)
      .set({
        slug: mangledSlug,
        shopName: `Deleted shop ${tenantId.replace(/-/g, '').slice(0, 8)}`,
        contactPhone: null,
        contactEmail: null,
        businessAddress: null,
        suspendedReason: null,
        kycStatus: KycStatus.Unverified,
      })
      .where(eq(tenants.id, tenantId));
  }

  /** LIF-03/04: every tenant whose lifecycle state is derived from a running period, not yet deleted. */
  async findLapsingCandidates(tx: Executor, now: Date): Promise<LapsingCandidateRow[]> {
    const lapsingStates: TenantState[] = [
      TenantState.Active,
      TenantState.Grace,
      TenantState.ReadOnly,
      TenantState.Locked,
      TenantState.Archived,
    ];
    const rows = await tx
      .select({
        id: tenants.id,
        state: tenants.state,
        periodEnd: tenants.periodEnd,
        suspendedAt: tenants.suspendedAt,
        lapseScheduleSnapshot: tenants.lapseScheduleSnapshot,
      })
      .from(tenants)
      .where(
        and(
          inArray(tenants.state, lapsingStates),
          isNotNull(tenants.periodEnd),
          isNull(tenants.deletedAt),
          lte(tenants.periodEnd, now),
        ),
      );
    return rows
      .filter((row): row is typeof row & { periodEnd: Date } => row.periodEnd !== null)
      .map((row) => ({ ...row, periodEnd: row.periodEnd }));
  }

  /** BIL-14: still-`active` tenants whose period ends within the reminder window (7/3/1 days out) --
   *  the "daily during grace" half reuses `findLapsingCandidates` above, already looping over Grace. */
  async findUpcomingRenewalCandidates(
    tx: Executor,
    now: Date,
    horizon: Date,
  ): Promise<LapsingCandidateRow[]> {
    const rows = await tx
      .select({
        id: tenants.id,
        state: tenants.state,
        periodEnd: tenants.periodEnd,
        suspendedAt: tenants.suspendedAt,
        lapseScheduleSnapshot: tenants.lapseScheduleSnapshot,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.state, TenantState.Active),
          isNotNull(tenants.periodEnd),
          isNull(tenants.deletedAt),
          gt(tenants.periodEnd, now),
          lte(tenants.periodEnd, horizon),
        ),
      );
    return rows
      .filter((row): row is typeof row & { periodEnd: Date } => row.periodEnd !== null)
      .map((row) => ({ ...row, periodEnd: row.periodEnd }));
  }

  /** PYG-21: every pay-as-you-go tenant, not yet deleted -- the 23/30-day thresholds are the service's job. */
  async findPaygInactiveCandidates(tx: Executor): Promise<PaygCandidateRow[]> {
    return tx
      .select({
        id: tenants.id,
        lastActivityAt: tenants.lastActivityAt,
        periodStart: tenants.periodStart,
        createdAt: tenants.createdAt,
        archivedAt: tenants.archivedAt,
      })
      .from(tenants)
      .where(and(eq(tenants.state, TenantState.PayAsYouGo), isNull(tenants.deletedAt)));
  }

  /** PYG-09/21, LIF-19: archived pay-as-you-go tenants -- by inactivity, closure or suspension. They never had a
   * billing period, so `period_end` stays null even in `archived`, unlike a subscription tenant. The
   * day-60-after-archival deletion clock for these runs from `archived_at`. */
  async findPaygArchivedCandidates(tx: Executor): Promise<PaygCandidateRow[]> {
    return tx
      .select({
        id: tenants.id,
        lastActivityAt: tenants.lastActivityAt,
        periodStart: tenants.periodStart,
        createdAt: tenants.createdAt,
        archivedAt: tenants.archivedAt,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.state, TenantState.Archived),
          isNull(tenants.periodEnd),
          isNull(tenants.deletedAt),
        ),
      );
  }

  /**
   * LIF-12, LIF-19: what decides when one shop's business data is deleted -- its state and period end with the schedule
   * its lapse keeps, or, for pay-as-you-go, its idle clock and archival. Null for no such shop.
   */
  async findLifecycleFacts(tx: Executor, tenantId: string): Promise<LifecycleFactsRow | null> {
    const rows = await tx
      .select({
        id: tenants.id,
        state: tenants.state,
        periodEnd: tenants.periodEnd,
        lapseScheduleSnapshot: tenants.lapseScheduleSnapshot,
        lastActivityAt: tenants.lastActivityAt,
        periodStart: tenants.periodStart,
        createdAt: tenants.createdAt,
        archivedAt: tenants.archivedAt,
        deletedAt: tenants.deletedAt,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** TEN-19, TEN-30: the shop's name and its own contact phone/email/business address, for the shop-settings screen. */
  async findContactDetails(tx: Executor, tenantId: string): Promise<ContactDetailsRow | null> {
    const rows = await tx
      .select({
        shopName: tenants.shopName,
        contactPhone: tenants.contactPhone,
        contactEmail: tenants.contactEmail,
        businessAddress: tenants.businessAddress,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** TEN-19, TEN-30: updates whichever of the name and the three contact fields the caller sent; an omitted key leaves
   * its current value untouched (the caller builds this object from only the keys present in the request). */
  async updateContactDetails(
    tx: Executor,
    tenantId: string,
    values: Partial<ContactDetailsRow>,
  ): Promise<void> {
    if (Object.keys(values).length === 0) return;
    await tx.update(tenants).set(values).where(eq(tenants.id, tenantId));
  }

  /** PST-01, PST-03: sets the shop's business type. Existing products keep their own settings. */
  async setBusinessType(
    tx: Executor,
    tenantId: string,
    businessType: string | null,
  ): Promise<void> {
    await tx.update(tenants).set({ businessType }).where(eq(tenants.id, tenantId));
  }

  /** BIL-10/11/UPG-03: a transaction-scoped read of what a purchase/renewal/upgrade confirmation needs to
   * decide whether to extend, restart, or prorate the running period. */
  async findBillingInfo(tx: Executor, id: string): Promise<BillingInfoRow | null> {
    const rows = await tx
      .select({
        state: tenants.state,
        shopName: tenants.shopName,
        planId: tenants.planId,
        periodStart: tenants.periodStart,
        periodEnd: tenants.periodEnd,
        billingTermId: tenants.billingTermId,
        autoRenewEnabled: tenants.autoRenewEnabled,
        cancelledAt: tenants.cancelledAt,
        planSnapshot: tenants.planSnapshot,
        featureSnapshot: tenants.featureSnapshot,
        retentionFloorDays: tenants.retentionFloorDays,
        retentionFloorUntil: tenants.retentionFloorUntil,
        createdAt: tenants.createdAt,
        suspendedAt: tenants.suspendedAt,
        archivedAt: tenants.archivedAt,
        downgradedAt: tenants.downgradedAt,
        downgradeOverLimit: tenants.downgradeOverLimit,
        downgradeFinalWarningAt: tenants.downgradeFinalWarningAt,
        autoBuyBandwidth: tenants.autoBuyBandwidth,
        autoBuyRequests: tenants.autoBuyRequests,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** PLN-15: the shop's auto-buy switches, either or both. */
  async setPackAutoBuy(
    tx: Executor,
    tenantId: string,
    values: { autoBuyBandwidth?: boolean; autoBuyRequests?: boolean },
  ): Promise<void> {
    await tx.update(tenants).set(values).where(eq(tenants.id, tenantId));
  }

  /** DWN-12: records the downgrade that just took effect, and the limits it left the shop over. */
  async setDowngraded(
    tx: Executor,
    tenantId: string,
    at: Date,
    overLimit: readonly string[],
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({ downgradedAt: at, downgradeOverLimit: [...overLimit], downgradeFinalWarningAt: null })
      .where(eq(tenants.id, tenantId));
  }

  /** DWN-14: the shops whose downgrade took effect by `before` and have had no final warning yet. */
  async listDowngradeWarningsDue(tx: Executor, before: Date): Promise<string[]> {
    const rows = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(
        and(
          lte(tenants.downgradedAt, before),
          isNull(tenants.downgradeFinalWarningAt),
          isNull(tenants.deletedAt),
        ),
      )
      .orderBy(asc(tenants.downgradedAt));
    return rows.map((row) => row.id);
  }

  /** DWN-14: the final warning went out (or was not needed), so it is never looked at again. */
  async setDowngradeFinalWarning(tx: Executor, tenantId: string, at: Date): Promise<void> {
    await tx.update(tenants).set({ downgradeFinalWarningAt: at }).where(eq(tenants.id, tenantId));
  }

  /** BIL-17: toggles the owner's own "renew automatically from balance" setting. */
  async setAutoRenew(tx: Executor, tenantId: string, enabled: boolean): Promise<void> {
    await tx.update(tenants).set({ autoRenewEnabled: enabled }).where(eq(tenants.id, tenantId));
  }

  /** DWN-11: protects the tenant's pre-downgrade retention until `until` -- written atomically with the
   * notice that explains it, so the column's own presence is proof a notice already went out. */
  async setRetentionFloor(
    tx: Executor,
    tenantId: string,
    floor: { days: number; until: Date },
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({ retentionFloorDays: floor.days, retentionFloorUntil: floor.until })
      .where(eq(tenants.id, tenantId));
  }
}

export interface BillingInfoRow {
  state: TenantState;
  // BIL-12: copied onto each invoice at issue.
  shopName: string;
  planId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  billingTermId: string | null;
  autoRenewEnabled: boolean;
  cancelledAt: Date | null;
  planSnapshot: PlanLimits | null;
  // PLN-02: the features the plan switched on when assigned; BRN-05 reads brand identity from it.
  featureSnapshot: Record<string, boolean> | null;
  retentionFloorDays: number | null;
  retentionFloorUntil: Date | null;
  createdAt: Date;
  suspendedAt: Date | null;
  archivedAt: Date | null;
  /** DWN-12, DWN-14: the last downgrade, the limits it left the shop over, and its final warning. */
  downgradedAt: Date | null;
  downgradeOverLimit: string[] | null;
  downgradeFinalWarningAt: Date | null;
  /** PLN-15: the auto-buy switches for bandwidth and request packs. */
  autoBuyBandwidth: boolean;
  autoBuyRequests: boolean;
}

export interface BalanceRow {
  amount: string;
  frozen: boolean;
  state: (typeof tenants.$inferSelect)['state'];
}

// LIF-26: the shape frozen onto a tenant's own `lapse_schedule_snapshot` column, matching the schema's own
// inline `$type`.
export interface StageLengthsSnapshot {
  grace: number;
  readOnly: number;
  locked: number;
  archived: number;
}

export interface LapsingCandidateRow {
  id: string;
  state: TenantState;
  periodEnd: Date;
  suspendedAt: Date | null;
  lapseScheduleSnapshot: StageLengthsSnapshot | null;
}

export interface RevocationCandidateRow {
  id: string;
  slug: string;
}

export interface PaygCandidateRow {
  id: string;
  lastActivityAt: Date | null;
  /** When the tenant became pay-as-you-go: the trial conversion sets it (TRL-07). */
  periodStart: Date | null;
  createdAt: Date;
  /** PYG-09: when it was archived; null while still pay-as-you-go, or for one archived before this was kept. */
  archivedAt: Date | null;
}

/** LIF-12, LIF-19: one shop's lifecycle facts, for the date its business data would be deleted. */
export interface LifecycleFactsRow extends PaygCandidateRow {
  state: TenantState;
  periodEnd: Date | null;
  lapseScheduleSnapshot: StageLengthsSnapshot | null;
  deletedAt: Date | null;
}

/** LIF-20/21: a deleted shop of an account, with whatever balance it still holds. */
export interface DeletedShopRow {
  id: string;
  balanceAmount: string;
}

/** TEN-30. Each field is independently nullable: null means "not set/cleared". */
export interface ContactDetailsRow {
  shopName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
}
