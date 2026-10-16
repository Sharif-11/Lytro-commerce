import type { PlanLimits, RateKey } from '@lytronix/validators';

/** Mirrors `planSchema` in apps/server/src/modules/team/dto/billing-response.dto.ts — see types/me.ts's own
    note on why this is a deliberate structural duplicate, not an import. */
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

/** Mirrors `planVersionSchema` — same file. */
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

/** Mirrors `planPriceSchema` — same file. */
export interface PlanPrice {
  planId: string;
  billingTermId: string;
  price: string;
}

/** Mirrors `billingTermSchema` — same file. */
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

/** Mirrors `rateHistoryEntrySchema` in apps/server/src/modules/team/dto/balance-response.dto.ts. */
export interface RateHistoryEntry {
  id: number;
  key: RateKey;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
  noticeId: string | null;
  changedAt: string;
}
