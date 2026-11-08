import type { FraudCheckTrigger, FraudSource, FraudSourceState } from '@lytronix/validators';

// Mirrors the fake order check's answers (apps/server/src/modules/fraud-checks, Phase 7 Slice 7.5; D7-45 to D7-52):
// figures only, never a level.

/** Steadfast's own figures, as it gave them. */
export interface SteadfastFigures {
  deliveredPercent: number | null;
  cancelledPercent: number | null;
  returnedPercent: number | null;
  volumeBand: string | null;
  volumeRange: string | null;
  reports: number;
  doubtful: boolean;
  categories: string[];
}

export interface FraudCheckView {
  id: string;
  phone: string;
  checkedAt: string;
  trigger: FraudCheckTrigger;
  orderId: string | null;
  /** FRD-02, FRD-11: each source and what it did; a reused courier answer is cached (FRD-03). */
  sources: { source: FraudSource; state: FraudSourceState; cached: boolean }[];
  steadfast: SteadfastFigures | null;
  ownOrders: { delivered: number; returned: number; cancelled: number };
  cost: string;
}

/** FRD-05, D7-50: the automatic check. */
export interface FraudRule {
  codOrders: boolean;
  minAmount: string | null;
}

/** The order's automatic check as it stands (GET /fraud-checks/orders/:orderId, Slice 7.7). */
export interface OrderFraudCheck {
  state: 'done' | 'pending' | 'skipped' | 'not_applicable';
  reason: 'rule_off' | 'below_minimum' | 'refused' | 'minute_limit' | 'failed' | null;
  /** The rule's smallest amount when the order was skipped under it. */
  minAmount: string | null;
  /** The server's own refusal words, when the reason is a refusal. */
  message: string | null;
  check: FraudCheckView | null;
}
