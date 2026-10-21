import type { UsageMetric } from '@lytronix/validators';
import type { UsageLevel } from '../../../common/usage-warnings';
import type { BandwidthDay } from '../../media/types/media';

/** LIM-02: one metric against the shop's limit; null is unlimited (PLN-19). */
export interface UsageFigure {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  /** Bytes for storage and bandwidth, a count for everything else. */
  unit: 'count' | 'bytes';
  /** Whether it starts again each cycle (bandwidth, requests, monthly SMS) or is a running total. */
  perCycle: boolean;
  /**
   * LIM-01: the highest share reached (50, 80, 95, 100), or `stopped` for bandwidth or requests past the grace, for the
   * dashboard's banner; null below half or when unlimited.
   */
  level: Exclude<UsageLevel, 'fast_spend'> | null;
}

/** LIM-01: one way to more room -- a plan, by its price for its shortest term and a month -- or the operator. */
export type Suggestion =
  | { kind: 'plan'; planId: string; name: string; price: number; months: number; monthly: number }
  | { kind: 'contact' };

/** LIM-01: the cheapest fix for every metric near its limit, and the next cheapest. */
export interface Suggestions {
  first: Suggestion;
  alternative: Suggestion | null;
}

/** LIM-02: what the usage page shows: every metric, the cycle the per-cycle ones belong to, and each day's bandwidth. */
export interface ShopUsage {
  cycleStart: Date;
  cycleEnd: Date;
  metrics: UsageFigure[];
  bandwidthDays: BandwidthDay[];
  /** LIM-01: what would give the shop room, when any metric is near its limit. */
  suggestions: Suggestions | null;
  /** RTE-12: when the cycle's last fast-spend alert went out, for the banner. */
  fastSpendAlertedAt: Date | null;
}
