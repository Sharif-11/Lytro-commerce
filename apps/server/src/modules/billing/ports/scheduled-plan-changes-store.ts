import type { Transaction } from '@lytronix/db';
import type { ScheduledPlanChangeKind } from '@lytronix/validators';
import type { ScheduledPlanChangeRecord } from '../types/scheduled-plan-change';

export interface NewScheduledPlanChangeValues {
  tenantId: string;
  kind: ScheduledPlanChangeKind;
  // Null for a switch to pay-as-you-go (PYG-10), which has no plan to pick.
  targetPlanId: string | null;
  effectiveAt: Date;
}

/** control.scheduled_plan_changes (DWN-01/04, UPG-13). */
export interface ScheduledPlanChangesStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  upsert(tx: Transaction, values: NewScheduledPlanChangeValues): Promise<ScheduledPlanChangeRecord>;
  findByTenant(tx: Transaction, tenantId: string): Promise<ScheduledPlanChangeRecord | null>;
  delete(tx: Transaction, tenantId: string): Promise<void>;
  /** DWN-06/08/17: every scheduled change due to apply now -- the recurring tick's own candidate list. */
  findDue(tx: Transaction, now: Date): Promise<ScheduledPlanChangeRecord[]>;
}
