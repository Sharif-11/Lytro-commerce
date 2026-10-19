import type {
  PlanLimits,
  PlanPaymentKind,
  PlanPaymentStatus,
  RateKey,
  TenantState,
} from '@lytronix/validators';

/**
 * The console's view of the server's operator responses. No shared package exports response shapes yet
 * (only request validation and error codes), so these are deliberate structural duplicates of server-only
 * types; each names the file it mirrors.
 */

/** apps/server/src/modules/operator: POST /auth/operator/signin. */
export type OperatorSigninResult =
  { next: 'enroll-2fa'; secret: string; uri: string } | { next: 'verify-2fa' };

export interface OperatorEnrolled {
  csrfToken: string;
  backupCodes: string[];
}

export interface OperatorVerified {
  csrfToken: string;
}

/** `planSchema` in apps/server/src/modules/team/dto/billing-response.dto.ts. */
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  version: number;
  limits: PlanLimits;
  features: Record<string, boolean>;
  createdAt: string;
}

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
  recordedAt: string;
}

export interface PlanPrice {
  planId: string;
  billingTermId: string;
  price: string;
}

export interface BillingTerm {
  id: string;
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
  defaultDiscountPct: string | null;
  tenantId: string | null;
  retiredAt: string | null;
  createdAt: string;
}

/** apps/server/src/modules/billing/types/plan-assignment.ts. */
export interface PlanAssignment {
  id: string;
  tenantId: string;
  planId: string;
  expiry: string | null;
  reason: string;
  assignedBy: string;
  assignedAt: string;
}

export interface PlanLimitOverride {
  id: string;
  tenantId: string;
  limitKey: string;
  value: number | boolean | null;
  reason: string;
  setBy: string;
  setAt: string;
}

/** apps/server/src/modules/balance/types/rate.ts and the rate history DTO. */
export interface RateValue {
  key: RateKey;
  value: string;
  effectiveFrom: string;
}

export interface RateHistoryEntry {
  id: number;
  key: RateKey;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
  noticeId: string | null;
  changedAt: string;
}

/** apps/server/src/modules/platform-settings/types/platform-setting.ts. */
export interface PlatformSetting {
  key: string;
  value: number | string | boolean;
  description: string;
  updatedBy: string | null;
  updatedAt: string;
}

/** `tenantSummarySchema` in apps/server/src/modules/team/dto/balance-response.dto.ts. */
export interface TenantSummary {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  periodEnd: string | null;
}

export interface TenantSummaryPage {
  entries: TenantSummary[];
  nextCursor: string | null;
}

/** apps/server/src/modules/payments/types/plan-payment.ts. */
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

/** apps/server/src/modules/balance/types/platform-wallet.ts. */
export interface PlatformWallet {
  id: string;
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
}

/** apps/server/src/modules/balance/types/ledger-entry.ts: what a balance adjustment returns. */
export interface LedgerEntry {
  id: number;
  type: string;
  amount: string;
  balanceAfter: string;
  createdAt: string;
}
