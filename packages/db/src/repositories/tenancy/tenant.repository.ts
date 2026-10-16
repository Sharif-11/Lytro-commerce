import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, lte } from 'drizzle-orm';
import type { Database } from '../../client';
import type { Executor } from '../../transactions';
import { plans, tenantDomains, tenants } from '../../schema';
import { DomainStatus, TenantState, type PlanLimits } from '@lytronix/validators';

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
  planLimits: PlanLimits | null;
  periodEnd: Date | null;
}

// LIF-24: the operator's own keyset cursor for search() -- the latest-created tenant the caller has already
// seen, the same (createdAt, id) tie-break shape as the audit log's own cursor.
export interface TenantSearchCursor {
  createdAt: Date;
  id: string;
}

export interface TenantSearchRow extends TenantSummaryRow {
  createdAt: Date;
}

export class TenantRepository {
  async findSummaryById(db: Database, id: string): Promise<TenantSummaryRow | null> {
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        shopName: tenants.shopName,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        planId: tenants.planId,
        planName: plans.name,
        planLimits: plans.limits,
        periodEnd: tenants.periodEnd,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** LIF-24: the operator's tenant search, by shop name or slug substring -- never OFFSET, the same
   * keyset discipline the audit log's own list() uses. Pass `limit + 1` to learn whether another page
   * exists (AuditService.list's own trick). */
  async search(
    db: Database,
    filters: { query: string | null },
    cursor: TenantSearchCursor | null,
    limit: number,
  ): Promise<TenantSearchRow[]> {
    const conditions = [];
    if (filters.query) {
      const pattern = `%${filters.query}%`;
      conditions.push(or(ilike(tenants.shopName, pattern), ilike(tenants.slug, pattern)));
    }
    if (cursor) {
      conditions.push(
        or(
          lt(tenants.createdAt, cursor.createdAt),
          and(eq(tenants.createdAt, cursor.createdAt), lt(tenants.id, cursor.id)),
        ),
      );
    }
    return db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        shopName: tenants.shopName,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        planId: tenants.planId,
        planName: plans.name,
        planLimits: plans.limits,
        periodEnd: tenants.periodEnd,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tenants.createdAt), desc(tenants.id))
      .limit(limit);
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

  /** The shop that owns a verified, active custom domain. Pending, failed and removed domains never match (TEN-12). */
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
        and(eq(tenantDomains.hostname, hostname), eq(tenantDomains.status, DomainStatus.Active)),
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
  ): Promise<{ id: string; limits: PlanLimits } | null> {
    const rows = await db
      .select({ id: plans.id, limits: plans.limits })
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

  /** BAL-07/08/09: freezes or unfreezes the balance without touching its amount. */
  async setBalanceFrozen(tx: Executor, tenantId: string, frozen: boolean): Promise<void> {
    await tx.update(tenants).set({ balanceFrozen: frozen }).where(eq(tenants.id, tenantId));
  }

  /** Writes the new balance (and, for pay-as-you-go activity, the cached last-activity timestamp, D2-11). */
  async applyBalanceChange(
    tx: Executor,
    tenantId: string,
    amount: string,
    options: { frozen?: boolean; touchActivityAt?: Date } = {},
  ): Promise<void> {
    await tx
      .update(tenants)
      .set({
        balanceAmount: amount,
        ...(options.frozen !== undefined ? { balanceFrozen: options.frozen } : {}),
        ...(options.touchActivityAt ? { lastActivityAt: options.touchActivityAt } : {}),
      })
      .where(eq(tenants.id, tenantId));
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
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        state: values.state,
        ...(values.billingTermId !== undefined ? { billingTermId: values.billingTermId } : {}),
      })
      .where(eq(tenants.id, tenantId));
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

  /** LIF-03/04/23: the lifecycle job's own state write -- plan, period and balance are untouched. */
  async setLifecycleState(tx: Executor, tenantId: string, state: TenantState): Promise<void> {
    await tx.update(tenants).set({ state }).where(eq(tenants.id, tenantId));
  }

  /** LIF-19: the day-60 deletion job's own state/marker write. */
  async markDeleted(tx: Executor, tenantId: string, at: Date): Promise<void> {
    await tx
      .update(tenants)
      .set({ deletedAt: at, state: TenantState.Deleted })
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

  /** PYG-21: every pay-as-you-go tenant, not yet deleted -- the 23/30-day thresholds are the service's job. */
  async findPaygInactiveCandidates(tx: Executor): Promise<PaygCandidateRow[]> {
    return tx
      .select({
        id: tenants.id,
        lastActivityAt: tenants.lastActivityAt,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(and(eq(tenants.state, TenantState.PayAsYouGo), isNull(tenants.deletedAt)));
  }

  /** PYG-21/LIF-19: tenants already archived by the inactivity pass (never had a billing period, so
   * `period_end` stays null even in `archived` -- unlike a subscription tenant, which always has one). The
   * day-60-after-archival deletion clock for these is tracked the same way, from `last_activity_at`. */
  async findPaygArchivedCandidates(tx: Executor): Promise<PaygCandidateRow[]> {
    return tx
      .select({
        id: tenants.id,
        lastActivityAt: tenants.lastActivityAt,
        createdAt: tenants.createdAt,
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

  /** TEN-30: the owner's own contact phone/email/business address, read for the shop-settings screen. */
  async findContactDetails(tx: Executor, tenantId: string): Promise<ContactDetailsRow | null> {
    const rows = await tx
      .select({
        contactPhone: tenants.contactPhone,
        contactEmail: tenants.contactEmail,
        businessAddress: tenants.businessAddress,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** TEN-30: updates whichever of the three contact fields the caller sent; an omitted key leaves its
   * current value untouched (the caller builds this object from only the keys present in the request). */
  async updateContactDetails(
    tx: Executor,
    tenantId: string,
    values: Partial<ContactDetailsRow>,
  ): Promise<void> {
    if (Object.keys(values).length === 0) return;
    await tx.update(tenants).set(values).where(eq(tenants.id, tenantId));
  }

  /** BIL-10/11/UPG-03: a transaction-scoped read of what a purchase/renewal/upgrade confirmation needs to
   * decide whether to extend, restart, or prorate the running period. */
  async findBillingInfo(tx: Executor, id: string): Promise<BillingInfoRow | null> {
    const rows = await tx
      .select({
        state: tenants.state,
        planId: tenants.planId,
        periodStart: tenants.periodStart,
        periodEnd: tenants.periodEnd,
        billingTermId: tenants.billingTermId,
        autoRenewEnabled: tenants.autoRenewEnabled,
        cancelledAt: tenants.cancelledAt,
        planSnapshot: tenants.planSnapshot,
        retentionFloorDays: tenants.retentionFloorDays,
        retentionFloorUntil: tenants.retentionFloorUntil,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return rows[0] ?? null;
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
  planId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  billingTermId: string | null;
  autoRenewEnabled: boolean;
  cancelledAt: Date | null;
  planSnapshot: PlanLimits | null;
  retentionFloorDays: number | null;
  retentionFloorUntil: Date | null;
}

export interface BalanceRow {
  amount: string;
  frozen: boolean;
  state: (typeof tenants.$inferSelect)['state'];
}

export interface LapsingCandidateRow {
  id: string;
  state: TenantState;
  periodEnd: Date;
  suspendedAt: Date | null;
}

export interface PaygCandidateRow {
  id: string;
  lastActivityAt: Date | null;
  createdAt: Date;
}

/** TEN-30. Each field is independently nullable: null means "not set/cleared". */
export interface ContactDetailsRow {
  contactPhone: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
}
