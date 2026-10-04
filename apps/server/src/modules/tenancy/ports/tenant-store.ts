import type { Transaction } from '@lytronix/db';
import type { PlanLimits } from '@lytronix/validators';

// Shop rows and the Trial plan, written inside the caller's transaction. Implemented in database/adapters.
export interface TenantStore {
  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null>;
  insertTenant(
    tx: Transaction,
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
  ): Promise<string>;
}
