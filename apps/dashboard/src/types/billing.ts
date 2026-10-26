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

/** POST /billing/upgrade/quote: the request, with the period it would run were it confirmed now (UPG-06). */
export interface UpgradeQuote extends PlanPayment {
  periodStart: string;
  periodEnd: string;
}

/** What paying for a plan on a term would be for the shop now (GET /billing/prices). */
export type PriceMove = 'renewal' | 'purchase' | 'upgrade' | 'downgrade';

/** PLN-14, UPG-14: an add-on the payment would carry or extend. */
export interface PricedAddon {
  addonId: string;
  key: string;
  labelEn: string;
  quantity: number;
  amount: string;
}

/**
 * GET /billing/prices (BIL-09): one plan's figures on the term, read without making a payment -- the same `offer` its
 * request is made from, so what is shown is what is charged.
 */
export interface PlanPriceOption {
  planId: string;
  planName: string;
  move: PriceMove;
  price: string;
  /** What the payment would hold; null for a move down, which charges nothing now, and an upgrade not open now. */
  amount: string | null;
  credit: string | null;
  addons: PricedAddon[];
  /** Why it cannot be paid now (the server's message key); null when it can. */
  blockedBy: string | null;
}

/** GET /billing/downgrade/checklist (DWN-12, DWN-14): what the last downgrade left the shop over, live. */
export interface DowngradeChecklist {
  downgradedAt: string;
  endsAt: string;
  items: (OverLimitItem & { fixed: boolean })[];
  finalWarningAt: string | null;
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
