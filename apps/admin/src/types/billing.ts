import type { PlanLimits, ScheduledPlanChangeKind } from '@lytronix/validators';

/** Mirrors `scheduledPlanChangeSchema` in apps/server/src/modules/team/dto/billing-response.dto.ts. */
export interface ScheduledPlanChange {
  id: string;
  tenantId: string;
  kind: ScheduledPlanChangeKind;
  targetPlanId: string | null;
  effectiveAt: string;
  createdAt: string;
}

/** Mirrors `overLimitItemSchema` — same file. DWN-03's downgrade preview: one limit the shop is currently
    over, if it switched to the target plan right now. */
export interface OverLimitItem {
  key: string;
  used: number;
  limit: number;
}

/** Mirrors `invoiceSchema` — same file. */
export interface Invoice {
  id: string;
  tenantId: string;
  number: number;
  kind: string;
  planSnapshot: PlanLimits;
  amount: string;
  creditAmount: string;
  billingTermLabel: string;
  issuedAt: string;
}
