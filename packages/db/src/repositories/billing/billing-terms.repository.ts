import { and, eq, isNull, or } from 'drizzle-orm';
import {
  billingTerms,
  planPrices,
  type SelectBillingTerm,
  type SelectPlanPrice,
} from '../../schema';
import type { Executor } from '../../transactions';

export interface NewBillingTerm {
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
  defaultDiscountPct: string | null;
  tenantId: string | null;
}

export type BillingTermEdit = Partial<Omit<NewBillingTerm, 'tenantId'>>;

// TRM-01 to TRM-16: billing terms and their per-plan prices.
export class BillingTermsRepository {
  async insert(db: Executor, values: NewBillingTerm): Promise<SelectBillingTerm> {
    const [row] = await db.insert(billingTerms).values(values).returning();
    if (!row) throw new Error('insert returned no billing term');
    return row;
  }

  async findById(db: Executor, id: string): Promise<SelectBillingTerm | null> {
    const rows = await db.select().from(billingTerms).where(eq(billingTerms.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /** TRM-14: platform-wide terms, plus any term scoped to this one tenant. Includes retired for the operator view. */
  async listVisibleFor(db: Executor, tenantId: string | null): Promise<SelectBillingTerm[]> {
    const scope = tenantId
      ? or(isNull(billingTerms.tenantId), eq(billingTerms.tenantId, tenantId))
      : isNull(billingTerms.tenantId);
    return db
      .select()
      .from(billingTerms)
      .where(and(eq(billingTerms.visible, true), scope));
  }

  async listAll(db: Executor): Promise<SelectBillingTerm[]> {
    return db.select().from(billingTerms);
  }

  /** TRM-11: affects future purchases only -- never touches a snapshot already taken. */
  async update(db: Executor, id: string, edit: BillingTermEdit): Promise<SelectBillingTerm | null> {
    const [row] = await db
      .update(billingTerms)
      .set(edit)
      .where(eq(billingTerms.id, id))
      .returning();
    return row ?? null;
  }

  async retire(db: Executor, id: string, at: Date): Promise<void> {
    await db.update(billingTerms).set({ retiredAt: at }).where(eq(billingTerms.id, id));
  }

  /** TRM-05: a term priced for any plan isn't deletable. */
  async isUsed(db: Executor, id: string): Promise<boolean> {
    const rows = await db
      .select({ planId: planPrices.planId })
      .from(planPrices)
      .where(eq(planPrices.billingTermId, id))
      .limit(1);
    return rows.length > 0;
  }

  async delete(db: Executor, id: string): Promise<void> {
    await db.delete(billingTerms).where(eq(billingTerms.id, id));
  }
}

// TRM-03: the price of each plan for each term, stored explicitly.
export class PlanPricesRepository {
  async set(db: Executor, planId: string, billingTermId: string, price: string): Promise<void> {
    await db
      .insert(planPrices)
      .values({ planId, billingTermId, price })
      .onConflictDoUpdate({
        target: [planPrices.planId, planPrices.billingTermId],
        set: { price },
      });
  }

  async listForPlan(db: Executor, planId: string): Promise<SelectPlanPrice[]> {
    return db.select().from(planPrices).where(eq(planPrices.planId, planId));
  }

  async remove(db: Executor, planId: string, billingTermId: string): Promise<void> {
    await db
      .delete(planPrices)
      .where(and(eq(planPrices.planId, planId), eq(planPrices.billingTermId, billingTermId)));
  }
}
