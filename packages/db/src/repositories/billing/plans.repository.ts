import { and, count, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { PlanLimits } from '@lytronix/validators';
import {
  planAssignments,
  planPayments,
  planPrices,
  planVersions,
  plans,
  scheduledPlanChanges,
  tenants,
  type SelectPlan,
} from '../../schema';
import type { Executor } from '../../transactions';

export interface NewPlan {
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
}

export interface PlanEdit {
  name?: string;
  description?: string | null;
  rank?: number;
  forSale?: boolean;
  limits?: PlanLimits;
  features?: Record<string, boolean>;
}

// PLN-01 to PLN-12, PLN-16 to PLN-18: plan rows and their versioning.
export class PlansRepository {
  async insert(db: Executor, values: NewPlan): Promise<SelectPlan> {
    const [row] = await db.insert(plans).values(values).returning();
    if (!row) throw new Error('insert returned no plan');
    return row;
  }

  async findById(db: Executor, id: string): Promise<SelectPlan | null> {
    const rows = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /** PLN-21: the plan row, locked for the rest of the transaction, so a concurrent edit waits or is seen. */
  async findByIdForUpdate(db: Executor, id: string): Promise<SelectPlan | null> {
    const rows = await db.select().from(plans).where(eq(plans.id, id)).limit(1).for('update');
    return rows[0] ?? null;
  }

  /** PLN-21: one mark change at a time, so two operators marking different plans at once never clash on the index. */
  async lockSuggestion(db: Executor): Promise<void> {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('control.plans.suggested'))`);
  }

  /**
   * PLN-21: marks or unmarks one plan. Marking clears the mark from any other plan first. Not a plan edit: no version
   * snapshot and no version bump (PLN-02 versions a plan's terms; the mark is not one).
   */
  async setSuggested(db: Executor, id: string, suggested: boolean): Promise<SelectPlan | null> {
    if (suggested) {
      await db
        .update(plans)
        .set({ suggested: false })
        .where(and(eq(plans.suggested, true), ne(plans.id, id)));
    }
    const [row] = await db.update(plans).set({ suggested }).where(eq(plans.id, id)).returning();
    return row ?? null;
  }

  /** PLN-10: for-sale plans only, for the tenant-facing/public list. Never returns a not-for-sale row. */
  async listForSale(db: Executor): Promise<SelectPlan[]> {
    return db.select().from(plans).where(eq(plans.forSale, true));
  }

  /** Includes not-for-sale plans, for the operator's own list. */
  async listAll(db: Executor): Promise<SelectPlan[]> {
    return db.select().from(plans);
  }

  /**
   * PLN-02/D2-3: snapshots the current row to plan_versions, then applies the edit and bumps the version
   * number, in the same transaction the caller already has open.
   */
  async update(db: Executor, id: string, edit: PlanEdit): Promise<SelectPlan | null> {
    const current = await this.findById(db, id);
    if (!current) return null;
    await db.insert(planVersions).values({
      planId: current.id,
      version: current.version,
      name: current.name,
      description: current.description,
      rank: current.rank,
      forSale: current.forSale,
      limits: current.limits,
      features: current.features,
    });
    const [row] = await db
      .update(plans)
      .set({ ...edit, version: sql`${plans.version} + 1` })
      .where(eq(plans.id, id))
      .returning();
    return row ?? null;
  }

  /** PLN-08: a plan referenced by any snapshot (tenant currently on it, or assigned to it) isn't deletable. */
  /**
   * PLN-08: every table with a foreign key to `plans.id` -- not just the two a casual reading of "referenced
   * by a snapshot or assignment" suggests. A plan that was ever priced, paid for, edited (plan_versions), or
   * has a pending scheduled change targeting it is just as un-deletable at the database level; checking only
   * assignments/tenants and missing these left DELETE crashing on a raw FK violation instead of PLN-08's own
   * clean `conflict`.
   */
  async isReferenced(db: Executor, id: string): Promise<boolean> {
    // Awaited one at a time (a query builder runs only when awaited): the caller's transaction is one connection.
    const checks = [
      db
        .select({ id: planAssignments.id })
        .from(planAssignments)
        .where(eq(planAssignments.planId, id))
        .limit(1),
      db.select({ id: tenants.id }).from(tenants).where(eq(tenants.planId, id)).limit(1),
      db
        .select({ planId: planPrices.planId })
        .from(planPrices)
        .where(eq(planPrices.planId, id))
        .limit(1),
      db
        .select({ id: planPayments.id })
        .from(planPayments)
        .where(eq(planPayments.planId, id))
        .limit(1),
      db
        .select({ id: planVersions.id })
        .from(planVersions)
        .where(eq(planVersions.planId, id))
        .limit(1),
      db
        .select({ id: scheduledPlanChanges.id })
        .from(scheduledPlanChanges)
        .where(eq(scheduledPlanChanges.targetPlanId, id))
        .limit(1),
    ];
    for (const check of checks) {
      if ((await check).length > 0) return true;
    }
    return false;
  }

  /** PLN-02: how many shops sit on each version of each plan, as their snapshots say. */
  async shopsByVersion(
    db: Executor,
  ): Promise<{ planId: string; version: number; shops: number }[]> {
    const rows = await db
      .select({
        planId: tenants.planId,
        version: tenants.planVersionSnapshot,
        shops: count(),
      })
      .from(tenants)
      .where(isNotNull(tenants.planId))
      .groupBy(tenants.planId, tenants.planVersionSnapshot);
    return rows.flatMap(({ planId, version, shops }) =>
      planId === null || version === null ? [] : [{ planId, version, shops }],
    );
  }

  /** Throws nothing -- the caller checks isReferenced first; this only runs when it's safe. */
  async delete(db: Executor, id: string): Promise<void> {
    await db.delete(plans).where(eq(plans.id, id));
  }

  async listVersions(db: Executor, planId: string): Promise<(typeof planVersions.$inferSelect)[]> {
    return db
      .select()
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(planVersions.version);
  }
}
