import type { UsageMetric } from '@lytronix/validators';
import type { UsageLevel } from '../../../common/usage-warnings';
import type { ApiUsageDay } from '../../public-api/types/public-api';

/**
 * LIM-02: one metric against the shop's limit; null is unlimited (PLN-19). For API requests the limit is the cycle's
 * allowance -- the shop's own limit, then its packs (RTE-11).
 */
export interface UsageFigure {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  /** RTE-11: what is left of the shop's packs for the metric; null for a metric with no packs. */
  packLeft: number | null;
  /** RTE-03: where a metric that serves shoppers stops -- the allowance and the grace after it; else null. */
  stopAt: number | null;
  /** Bytes for storage, a count for everything else. */
  unit: 'count' | 'bytes';
  /** Whether it starts again each cycle (requests, monthly SMS, monthly orders) or is a running total. */
  perCycle: boolean;
  /**
   * LIM-01: the highest share reached (50, 80, 95, 100), or `stopped` for requests past the grace, for the dashboard's
   * banner; null below half or when unlimited.
   */
  level: Exclude<UsageLevel, 'fast_spend'> | null;
  /**
   * LIM-01: for requests, when the cycle's pace uses the allowance up before the cycle ends -- the same figure the
   * email gives; null when it lasts the cycle, is already used up, or for any other metric (Slice 11.5c).
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
  /** Slice 7.3: its Bangla name, which a Bangla notice and screen show; the English one when absent. */
  nameBn?: string;
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
 * RTE-11, PLN-15: for a metric with packs, the pack for sale and its price (whole taka; null when the shop cannot buy
 * one), and how auto-buy stands this cycle -- what the page and its notices offer.
 */
export interface UsagePack {
  metric: UsageMetric.Requests;
  offer: { addonId: string; name: string; nameBn?: string; price: number } | null;
  autoBuy: boolean;
  autoPacks: number;
  autoBuyFailed: boolean;
}

/**
 * LIM-02: what the usage page shows: every metric, the cycle the per-cycle ones belong to, and each day's API requests.
 */
export interface ShopUsage {
  cycleStart: Date;
  cycleEnd: Date;
  metrics: UsageFigure[];
  /** Each day's API requests, for the chart and the run-out date (Slice 11.5a.2). */
  requestDays: ApiUsageDay[];
  /** LIM-01: what would give the shop room, when any metric is near its limit. */
  suggestions: Suggestions | null;
  /** RTE-12: when the cycle's last fast-spend alert went out, for the banner. */
  fastSpendAlertedAt: Date | null;
  /** RTE-11, PLN-15: the packs on sale and auto-buy, for API requests. */
  packs: UsagePack[];
  /** PLN-20, D7-36 (Slice 7.7): what is paid for use by use -- address reads -- this cycle, and its allowance. */
  payPerUse: PayPerUse[];
}

/** PLN-20 (Slice 7.7): one service paid use by use, its allowances pooled, and the uses paid one by one at the rate. */
export interface PayPerUse {
  key: 'address_reads';
  rate: string;
  allowance: { used: number; total: number; left: number; endsAt: Date } | null;
  outsideAllowance: { count: number; cost: string };
}
