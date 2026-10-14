import type { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';

export interface PlanPaymentRecord {
  id: string;
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  quotedAt: Date;
  status: PlanPaymentStatus;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}
