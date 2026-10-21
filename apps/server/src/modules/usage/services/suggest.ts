import type { PlanLimits } from '@lytronix/validators';
import type { Suggestion, Suggestions, UsageFigure } from '../types/usage';
import { metricLimit } from './metric-limits';

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
 * LIM-01 (the rule agreed for Slice 10): when any metric is near its limit, the cheapest way a month to room for every
 * metric the shop uses -- not only the one that warned -- and the next cheapest as the alternative. A plan that would
 * leave any metric near its limit again is no fix, so it is skipped; one below the shop's own is never offered. When no
 * plan fits, the operator: a custom plan. Slice 10a adds the add-ons and packs to the same comparison.
 */
export function suggest(
  figures: readonly UsageFigure[],
  current: CurrentPlan,
  plans: readonly PlanOption[],
): Suggestions | null {
  if (!anyNear(figures)) return null;
  const options = plans
    .filter((plan) => current.rank === null || plan.rank > current.rank)
    .filter((plan) => fits(plan, figures))
    .sort((a, b) => monthly(a) - monthly(b) || a.rank - b.rank);
  const [first, second] = options;
  if (!first) return { first: { kind: 'contact' }, alternative: null };
  return { first: planSuggestion(first), alternative: second ? planSuggestion(second) : null };
}
