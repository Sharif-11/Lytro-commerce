import type { OperatorPlan } from '@/types/operator';

/** The words under the switch: what it does now, or why it can't. */
export type SuggestionNote =
  | { key: 'plans.suggestedOn' }
  | { key: 'plans.suggestedMove'; name: string }
  | { key: 'plans.suggestedNone' }
  | { key: 'plans.suggestedOff' };

/** The plan editor's "Suggested plan" switch (OPERATOR-CONSOLE-DESIGN §6, PLN-21). */
export type SuggestionSwitch =
  { shown: false } | { shown: true; enabled: boolean; note: SuggestionNote };

/**
 * Whether the switch shows, whether it can be flipped, and its note. `on` is what the switch shows now: the plan's own
 * mark, or the one being saved. The Trial has no switch; a plan the pricing page doesn't show can't be marked, though a
 * mark it still carries can always be taken off (the server refuses only marking).
 */
export function suggestionSwitch(
  plan: OperatorPlan,
  allPlans: readonly OperatorPlan[],
  on: boolean,
): SuggestionSwitch {
  if (plan.trial) return { shown: false };
  if (on) return { shown: true, enabled: true, note: { key: 'plans.suggestedOn' } };
  if (!plan.onPricingPage) {
    return { shown: true, enabled: false, note: { key: 'plans.suggestedOff' } };
  }
  const marked = allPlans.find((each) => each.suggested && each.id !== plan.id);
  return {
    shown: true,
    enabled: true,
    note: marked
      ? { key: 'plans.suggestedMove', name: marked.name }
      : { key: 'plans.suggestedNone' },
  };
}
