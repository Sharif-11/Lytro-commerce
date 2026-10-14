import type { ScheduledPlanChangeKind } from '@lytronix/validators';

export interface ScheduledPlanChangeRecord {
  id: string;
  tenantId: string;
  kind: ScheduledPlanChangeKind;
  targetPlanId: string | null;
  effectiveAt: Date;
  createdAt: Date;
}
