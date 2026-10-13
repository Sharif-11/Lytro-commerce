import type { Transaction } from '@lytronix/db';
import type { PlanAssignmentRecord } from '../types/plan-assignment';

/** control.plan_assignments (PLN-17/18). */
export interface PlanAssignmentsStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  insert(
    tx: Transaction,
    values: {
      tenantId: string;
      planId: string;
      expiry: Date | null;
      reason: string;
      assignedBy: string;
    },
  ): Promise<PlanAssignmentRecord>;
}
