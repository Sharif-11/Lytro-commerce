import { and, eq, lte } from 'drizzle-orm';
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
  planName: string | null;
  planLimits: PlanLimits | null;
  periodEnd: Date | null;
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
}

export interface BalanceRow {
  amount: string;
  frozen: boolean;
  state: (typeof tenants.$inferSelect)['state'];
}
