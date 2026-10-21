import { ADDON_QUANTITY_MAX, type PlanLimits, type UsageLimitKey } from '@lytronix/validators';
import type { SuggestedAddon, Suggestion, Suggestions, UsageFigure } from '../types/usage';
import { metricLimit, metricLimitKey } from './metric-limits';

// LIM-01: a metric is near its limit from this share, and a plan fits only if every metric stays under it there.
const NEAR_PERCENT = 80;

/** A plan the shop could move to, as the suggestion compares them. */
export interface PlanOption {
  planId: string;
  name: string;
  rank: number;
  limits: PlanLimits;
  /** Its price, whole taka, for the shortest visible term that prices it, and that term's months. */
  price: number;
  months: number;
}

/** The plan the shop is on: its rank among plans for sale, or null when it is on none (trial, pay-as-you-go). */
export interface CurrentPlan {
  rank: number | null;
}

/** A limit add-on the shop can buy now (PLN-13): the limit it raises, by how much in that limit's unit, and a month. */
export interface AddonOption {
  addonId: string;
  key: string;
  name: string;
  limitKey: UsageLimitKey;
  unitSize: number;
  monthly: number;
}

/** PLN-13: what staying on the shop's plan with add-ons is judged by -- the plan's price a month, and its add-ons. */
export interface AddonChoice {
  planMonthly: number;
  addons: readonly AddonOption[];
}

/** A fix, by what the shop would pay a month with it, and its rank for a tie. */
interface Ranked {
  suggestion: Suggestion;
  monthly: number;
  rank: number;
}

function near(figure: UsageFigure): boolean {
  return figure.limit !== null && figure.used * 100 >= figure.limit * NEAR_PERCENT;
}

/** Whether any metric is near its limit, so a suggestion is due at all. */
export function anyNear(figures: readonly UsageFigure[]): boolean {
  return figures.some(near);
}

function fits(plan: PlanOption, figures: readonly UsageFigure[]): boolean {
  return figures.every((figure) => {
    const limit = metricLimit(plan.limits, figure.metric);
    return limit === null || figure.used * 100 < limit * NEAR_PERCENT;
  });
}

function monthly(plan: PlanOption): number {
  return plan.price / plan.months;
}

function planSuggestion(plan: PlanOption): Suggestion {
  return {
    kind: 'plan',
    planId: plan.planId,
    name: plan.name,
    price: plan.price,
    months: plan.months,
    monthly: Math.round(monthly(plan)),
  };
}

/**
 * PLN-13, LIM-01: the fewest of each limit add-on that leave every metric near its limit clear of it again, on the
 * shop's own plan; null when one of them has no add-on, or would need more than one purchase buys.
 */
function addonSuggestion(
  figures: readonly UsageFigure[],
  addons: readonly AddonOption[],
): Extract<Suggestion, { kind: 'addons' }> | null {
  const items: SuggestedAddon[] = [];
  for (const figure of figures) {
    if (!near(figure) || figure.limit === null) continue;
    const { key, unit } = metricLimitKey(figure.metric);
    const addon = addons.find((option) => option.limitKey === key);
    if (!addon) return null;
    // The least n with the use under 80 percent of (limit + n units).
    const size = addon.unitSize * unit;
    const quantity =
      Math.floor((figure.used * 100 - figure.limit * NEAR_PERCENT) / (size * NEAR_PERCENT)) + 1;
    if (quantity > ADDON_QUANTITY_MAX) return null;
    items.push({
      addonId: addon.addonId,
      key: addon.key,
      name: addon.name,
      quantity,
      monthly: addon.monthly * quantity,
    });
  }
  if (items.length === 0) return null;
  return { kind: 'addons', items, monthly: items.reduce((sum, item) => sum + item.monthly, 0) };
}

/**
 * LIM-01 (the rule agreed for Slice 10): when any metric is near its limit, the cheapest way a month to room for every
 * metric the shop uses -- not only the one that warned -- and the next cheapest as the alternative. A plan that would
 * leave any metric near its limit again is no fix, so it is skipped; one below the shop's own is never offered. Limit
 * add-ons on the shop's own plan (Slice 10a) are one more fix, judged by the plan's price a month with theirs added,
 * and preferred on a tie. When nothing fits, the operator: a custom plan.
 */
export function suggest(
  figures: readonly UsageFigure[],
  current: CurrentPlan,
  plans: readonly PlanOption[],
  addons: AddonChoice | null = null,
): Suggestions | null {
  if (!anyNear(figures)) return null;
  const options: Ranked[] = plans
    .filter((plan) => current.rank === null || plan.rank > current.rank)
    .filter((plan) => fits(plan, figures))
    .map((plan) => ({ suggestion: planSuggestion(plan), monthly: monthly(plan), rank: plan.rank }));
  const bundle = addons && addonSuggestion(figures, addons.addons);
  if (addons && bundle) {
    options.push({
      suggestion: bundle,
      monthly: addons.planMonthly + bundle.monthly,
      rank: current.rank ?? 0,
    });
  }
  options.sort((a, b) => a.monthly - b.monthly || a.rank - b.rank);
  const [first, second] = options;
  if (!first) return { first: { kind: 'contact' }, alternative: null };
  return { first: first.suggestion, alternative: second?.suggestion ?? null };
}
