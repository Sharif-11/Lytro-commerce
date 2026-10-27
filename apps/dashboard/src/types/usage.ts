import type { UsageMetric } from '@lytronix/validators';

/** Mirrors `UsageFigure` in apps/server/src/modules/usage/types/usage.ts (LIM-01, LIM-02). */
export interface UsageFigure {
  metric: UsageMetric;
  used: number;
  /** Null is unlimited (PLN-19); for bandwidth and requests, the cycle's allowance with the packs. */
  limit: number | null;
  packLeft: number | null;
  /** Where a metric that serves shoppers stops: the allowance and the grace after it. */
  stopAt: number | null;
  unit: 'count' | 'bytes';
  perCycle: boolean;
  level: 50 | 80 | 95 | 100 | 'stopped' | null;
  /** Bandwidth and requests only: the day the cycle's pace uses the allowance up, when that falls in the cycle. */
  runsOutAt: string | null;
}

/** One limit add-on or pack in a suggestion, with the metric it gives room to (Slice 11.5c). */
export interface SuggestedAddon {
  addonId: string;
  key: string;
  name: string;
  metric: UsageMetric;
  quantity: number;
  monthly: number;
}

/** LIM-01: one way to more room. */
export type Suggestion =
  | { kind: 'plan'; planId: string; name: string; price: number; months: number; monthly: number }
  | { kind: 'addons'; items: SuggestedAddon[]; monthly: number }
  | { kind: 'contact' };

/** BND-04, RTE-11, PLN-15: the pack for sale for a metric, and how auto-buy stands this cycle. */
export interface UsagePack {
  metric: UsageMetric.Bandwidth | UsageMetric.Requests;
  offer: { addonId: string; name: string; price: number } | null;
  autoBuy: boolean;
  autoPacks: number;
  autoBuyFailed: boolean;
}

/** GET /usage (LIM-02). */
export interface ShopUsage {
  cycleStart: string;
  /** When the per-cycle counts start again: the day after the cycle's last. */
  cycleEnd: string;
  metrics: UsageFigure[];
  bandwidthDays: { day: string; bytes: number; requests: number }[];
  requestDays: { day: string; requests: number }[];
  suggestions: { first: Suggestion; alternative: Suggestion | null } | null;
  fastSpendAlertedAt: string | null;
  packs: UsagePack[];
}
