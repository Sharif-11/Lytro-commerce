import type { Transaction } from '@lytronix/db';
import type { ScheduledPlanChangeKind } from '@lytronix/validators';
import type { ScheduledPlanChangeRecord } from '../types/scheduled-plan-change';

export interface NewScheduledPlanChangeValues {
  tenantId: string;
  kind: ScheduledPlanChangeKind;
  targetPlanId: string;
  effectiveAt: Date;
}

/** control.scheduled_plan_changes (DWN-01/04, UPG-13). */
export interface ScheduledPlanChangesStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  upsert(tx: Transaction, values: NewScheduledPlanChangeValues): Promise<ScheduledPlanChangeRecord>;
  findByTenant(tx: Transaction, tenantId: string): Promise<ScheduledPlanChangeRecord | null>;
  delete(tx: Transaction, tenantId: string): Promise<void>;
}
