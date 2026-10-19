import type { PlanLimits, PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';

// The public plan catalogue (API-CONTRACT §8) and the quote/confirm payment row (D2-1). Structural
// duplicates of server response shapes, see types/me.ts.
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
