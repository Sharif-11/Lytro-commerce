export interface PlanAssignmentRecord {
  id: string;
  tenantId: string;
  planId: string;
  expiry: Date | null;
  reason: string;
  assignedBy: string;
  assignedAt: Date;
}

export interface PlanLimitOverrideRecord {
  id: string;
  tenantId: string;
  limitKey: string;
  value: unknown;
  reason: string;
  setBy: string;
  setAt: Date;
}
