import { eq, sql } from 'drizzle-orm';
import type { PlanLimits } from '@lytronix/validators';
import { planAssignments, planVersions, plans, tenants, type SelectPlan } from '../../schema';
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
  async isReferenced(db: Executor, id: string): Promise<boolean> {
    const assignments = await db
      .select({ id: planAssignments.id })
      .from(planAssignments)
      .where(eq(planAssignments.planId, id))
      .limit(1);
    if (assignments.length > 0) return true;
    const tenancy = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.planId, id))
      .limit(1);
    return tenancy.length > 0;
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
