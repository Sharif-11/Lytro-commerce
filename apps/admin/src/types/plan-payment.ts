import type { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';

/**
 * Mirrors `PlanPaymentRecord` in apps/server/src/modules/payments/types/plan-payment.ts -- see types/me.ts's
 * own note on why this is a deliberate structural duplicate, not an import. One shape covers every kind of
 * `control.plan_payments` row (D2-1) -- top-up, purchase, renewal and upgrade all quote/confirm through it.
 */
export interface PlanPayment {
  id: string;
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  quotedAt: string;
  status: PlanPaymentStatus;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}
