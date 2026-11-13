import type { PlanLimits } from '@lytronix/validators';

export interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  version: number;
  limits: PlanLimits;
  features: Record<string, boolean>;
  /** PLN-21: the plan the pricing page highlights; at most one is. */
  suggested: boolean;
  createdAt: Date;
}

/** PLN-02, PLN-08: a plan as the operator's list shows it. */
export interface OperatorPlanRecord extends PlanRecord {
  shopsByVersion: { version: number; shops: number }[];
  deletable: boolean;
  /** The Trial plan, which never shows on the pricing page and can't be suggested (PLN-21). */
  trial: boolean;
  /** PLN-21: the pricing page shows this plan (for sale, or Pay-as-you-go), so it can be the suggested one. */
  onPricingPage: boolean;
}

export interface PlanVersionRecord {
  id: string;
  planId: string;
  version: number;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
  recordedAt: Date;
}
