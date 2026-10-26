import type { UsageMetric } from '@lytronix/validators';
import type { UsageLevel } from '../../../common/usage-warnings';
import type { BandwidthDay } from '../../media/types/media';
import type { ApiUsageDay } from '../../public-api/types/public-api';

/**
 * LIM-02: one metric against the shop's limit; null is unlimited (PLN-19). For bandwidth and API requests the limit is
 * the cycle's allowance -- the shop's own limit, then its packs (BND-04, RTE-11).
 */
export interface UsageFigure {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  /** BND-04, RTE-11: what is left of the shop's packs for the metric; null for a metric with no packs. */
  packLeft: number | null;
  /** BND-03, RTE-03: where a metric that serves shoppers stops -- the allowance and the grace after it; else null. */
  stopAt: number | null;
  /** Bytes for storage and bandwidth, a count for everything else. */
  unit: 'count' | 'bytes';
  /** Whether it starts again each cycle (bandwidth, requests, monthly SMS) or is a running total. */
  perCycle: boolean;
  /**
   * LIM-01: the highest share reached (50, 80, 95, 100), or `stopped` for bandwidth or requests past the grace, for the
   * dashboard's banner; null below half or when unlimited.
   */
  level: Exclude<UsageLevel, 'fast_spend'> | null;
  /**
   * LIM-01: for bandwidth and requests, when the cycle's pace uses the allowance up before the cycle ends -- the same
   * figure the email gives; null when it lasts the cycle, is already used up, or for any other metric (Slice 11.5c).
   */
  runsOutAt: Date | null;
}

/**
 * PLN-13, LIM-01: one limit add-on to buy, how many, and what they cost a month together (whole taka); with the metric
 * it gives room to, so the usage page names it under that metric (Slice 11.5c).
 */
export interface SuggestedAddon {
  addonId: string;
  key: string;
  name: string;
  metric: UsageMetric;
  quantity: number;
  monthly: number;
}

/**
 * LIM-01: one way to more room -- a plan, by its price for its shortest term and a month; limit add-ons on the shop's
 * own plan, by what they add a month; or the operator.
 */
export type Suggestion =
  | { kind: 'plan'; planId: string; name: string; price: number; months: number; monthly: number }
  | { kind: 'addons'; items: SuggestedAddon[]; monthly: number }
  | { kind: 'contact' };

/** LIM-01: the cheapest fix for every metric near its limit, and the next cheapest. */
export interface Suggestions {
  first: Suggestion;
  alternative: Suggestion | null;
}

/**
 * BND-04, RTE-11, PLN-15: for a metric with packs, the pack for sale and its price (whole taka; null when the shop
 * cannot buy one), and how auto-buy stands this cycle -- what the page and its notices offer.
 */
export interface UsagePack {
  metric: UsageMetric.Bandwidth | UsageMetric.Requests;
  offer: { addonId: string; name: string; price: number } | null;
  autoBuy: boolean;
  autoPacks: number;
  autoBuyFailed: boolean;
}

/**
 * LIM-02: what the usage page shows: every metric, the cycle the per-cycle ones belong to, and each day's bandwidth and
 * API requests.
 */
export interface ShopUsage {
  cycleStart: Date;
  cycleEnd: Date;
  metrics: UsageFigure[];
  bandwidthDays: BandwidthDay[];
  /** Each day's API requests, for the chart and the run-out date (Slice 11.5a.2). */
  requestDays: ApiUsageDay[];
  /** LIM-01: what would give the shop room, when any metric is near its limit. */
  suggestions: Suggestions | null;
  /** RTE-12: when the cycle's last fast-spend alert went out, for the banner. */
  fastSpendAlertedAt: Date | null;
  /** BND-04, RTE-11, PLN-15: the packs on sale and auto-buy, for bandwidth and API requests. */
  packs: UsagePack[];
}
