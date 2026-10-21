import { and, eq, sql } from 'drizzle-orm';
import { planLimitOverrides, type SelectPlanLimitOverride } from '../../schema';
import type { Executor } from '../../transactions';

// PLN-11: a per-tenant override of one limit key, with a required reason.
export class PlanLimitOverridesRepository {
  async set(
    db: Executor,
    values: { tenantId: string; limitKey: string; value: unknown; reason: string; setBy: string },
  ): Promise<SelectPlanLimitOverride> {
    // PLN-19: unlimited is the JSON value null, which the column holds; a bare null would be no value at all.
    const value = values.value === null ? sql`'null'::jsonb` : values.value;
    const [row] = await db
      .insert(planLimitOverrides)
      .values({ ...values, value })
      .onConflictDoUpdate({
        target: [planLimitOverrides.tenantId, planLimitOverrides.limitKey],
        set: { value, reason: values.reason, setBy: values.setBy, setAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('insert returned no plan limit override');
    return row;
  }

  /** PLN-11: every shop's override of one limit, for a pass that judges every shop at once. */
  async listForKey(db: Executor, limitKey: string): Promise<SelectPlanLimitOverride[]> {
    return db.select().from(planLimitOverrides).where(eq(planLimitOverrides.limitKey, limitKey));
  }

  async listForTenant(db: Executor, tenantId: string): Promise<SelectPlanLimitOverride[]> {
    return db.select().from(planLimitOverrides).where(eq(planLimitOverrides.tenantId, tenantId));
  }

  /** Removing the row restores the plan snapshot value (PLN-11). */
  async remove(db: Executor, tenantId: string, limitKey: string): Promise<void> {
    await db
      .delete(planLimitOverrides)
      .where(
        and(eq(planLimitOverrides.tenantId, tenantId), eq(planLimitOverrides.limitKey, limitKey)),
      );
  }
}
