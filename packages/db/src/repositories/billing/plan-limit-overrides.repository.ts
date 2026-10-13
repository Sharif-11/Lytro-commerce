import { and, eq } from 'drizzle-orm';
import { planLimitOverrides, type SelectPlanLimitOverride } from '../../schema';
import type { Executor } from '../../transactions';

// PLN-11: a per-tenant override of one limit key, with a required reason.
export class PlanLimitOverridesRepository {
  async set(
    db: Executor,
    values: { tenantId: string; limitKey: string; value: unknown; reason: string; setBy: string },
  ): Promise<SelectPlanLimitOverride> {
    const [row] = await db
      .insert(planLimitOverrides)
      .values(values)
      .onConflictDoUpdate({
        target: [planLimitOverrides.tenantId, planLimitOverrides.limitKey],
        set: { value: values.value, reason: values.reason, setBy: values.setBy, setAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('insert returned no plan limit override');
    return row;
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
