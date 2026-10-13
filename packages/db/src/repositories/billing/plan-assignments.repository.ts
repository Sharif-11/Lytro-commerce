import { eq } from 'drizzle-orm';
import { planAssignments, type SelectPlanAssignment } from '../../schema';
import type { Executor } from '../../transactions';

// PLN-17/18: not-for-sale plan assignments. Append-only history; never updated or deleted.
export class PlanAssignmentsRepository {
  async insert(
    db: Executor,
    values: {
      tenantId: string;
      planId: string;
      expiry: Date | null;
      reason: string;
      assignedBy: string;
    },
  ): Promise<SelectPlanAssignment> {
    const [row] = await db.insert(planAssignments).values(values).returning();
    if (!row) throw new Error('insert returned no plan assignment');
    return row;
  }

  async listForTenant(db: Executor, tenantId: string): Promise<SelectPlanAssignment[]> {
    return db.select().from(planAssignments).where(eq(planAssignments.tenantId, tenantId));
  }
}
