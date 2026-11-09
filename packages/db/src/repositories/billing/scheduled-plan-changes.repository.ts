import { and, eq, lte, sql } from 'drizzle-orm';
import { scheduledPlanChanges, type SelectScheduledPlanChange } from '../../schema';
import type { ScheduledPlanChangeKind } from '@lytronix/validators';
import type { Executor } from '../../transactions';

export interface NewScheduledPlanChange {
  tenantId: string;
  kind: ScheduledPlanChangeKind;
  // Null for a switch to pay-as-you-go (PYG-10), which has no plan to pick.
  targetPlanId: string | null;
  effectiveAt: Date;
}

// DWN-01/04: one pending change per tenant (the unique constraint on tenant_id), insert-or-replace.
export class ScheduledPlanChangesRepository {
  async upsert(tx: Executor, values: NewScheduledPlanChange): Promise<SelectScheduledPlanChange> {
    const [row] = await tx
      .insert(scheduledPlanChanges)
      .values(values)
      .onConflictDoUpdate({
        target: scheduledPlanChanges.tenantId,
        set: {
          kind: values.kind,
          targetPlanId: values.targetPlanId,
          effectiveAt: values.effectiveAt,
        },
      })
      .returning();
    if (!row) throw new Error('insert returned no scheduled plan change');
    return row;
  }

  /** D8-35 (Slice 8.3): a change scheduled for the period's old end happens at its new one instead. */
  async moveEffectiveAt(tx: Executor, tenantId: string, from: Date, to: Date): Promise<void> {
    await tx
      .update(scheduledPlanChanges)
      .set({ effectiveAt: to })
      .where(
        and(
          eq(scheduledPlanChanges.tenantId, tenantId),
          sql`date_trunc('milliseconds', ${scheduledPlanChanges.effectiveAt}) = date_trunc('milliseconds', ${from.toISOString()}::timestamptz)`,
        ),
      );
  }

  async findByTenant(tx: Executor, tenantId: string): Promise<SelectScheduledPlanChange | null> {
    const rows = await tx
      .select()
      .from(scheduledPlanChanges)
      .where(eq(scheduledPlanChanges.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** DWN-06/08/17: every scheduled change whose effective date has arrived -- the recurring tick's own
   * candidate list, the same `WHERE ... <= now` shape `findLapsingCandidates`/`findExpiredTrialIds` use. */
  async findDue(tx: Executor, now: Date): Promise<SelectScheduledPlanChange[]> {
    return tx.select().from(scheduledPlanChanges).where(lte(scheduledPlanChanges.effectiveAt, now));
  }

  async delete(tx: Executor, tenantId: string): Promise<void> {
    await tx.delete(scheduledPlanChanges).where(eq(scheduledPlanChanges.tenantId, tenantId));
  }
}
