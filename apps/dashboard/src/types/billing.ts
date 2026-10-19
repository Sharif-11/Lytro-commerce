import type {
  PlanLimits,
  PlanPaymentKind,
  PlanPaymentStatus,
  ScheduledPlanChangeKind,
} from '@lytronix/validators';

// The public plan catalogue (API-CONTRACT §8) and the billing records (§8, §11). Structural duplicates of
// server response shapes, see types/me.ts.
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features?: Record<string, boolean>;
}

export interface BillingTerm {
  id: string;
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
}

export interface PlanPrice {
  planId: string;
  billingTermId: string;
  price: string;
}

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

/** GET /platform-wallets: where a manual wallet payment is sent (BIL-02). */
export interface PlatformWallet {
  id: string;
  provider: string;
  number: string;
  label: string | null;
}

/** GET /billing/downgrade (DWN-02). */
export interface ScheduledPlanChange {
  id: string;
  tenantId: string;
  kind: ScheduledPlanChangeKind;
  targetPlanId: string | null;
  effectiveAt: string;
  createdAt: string;
}

/** POST /billing/downgrade/preview: one limit the shop is over if it switched now (DWN-03). */
export interface OverLimitItem {
  key: string;
  used: number;
  limit: number;
}

/** GET /billing/invoices (BIL-12, BIL-13, LIF-21). The fields after `issuedAt` are null on invoices issued
    before 2026-10-18. */
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
  earlierShop?: boolean;
  shopName?: string | null;
  ownerName?: string | null;
  planName?: string | null;
  planVersion?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  discountAmount?: string | null;
  paymentMethod?: 'balance' | 'wallet' | null;
  paymentReference?: string | null;
}

/** GET /billing/cancellation (LIF-01). */
export interface CancellationStatus {
  cancelledAt: string | null;
}
