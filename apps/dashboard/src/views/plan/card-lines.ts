import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PlanCardLines,
  type PlanCardFlags,
  type PlanCardLine,
  type PlanCardPlan,
  type PlanCardRate,
} from '@lytronix/validators';

/** A card's lines and its quieter list. */
export interface CardLines {
  lines: PlanCardLine[];
  more: PlanCardLine[];
}

/**
 * The lines of every card shown, in the language shown: the flags are read from all of them together (the plans and
 * pay-as-you-go), so every card lists the same features; pay-as-you-go's fees come first on its card.
 */
export function useCardLines(
  plans: readonly (PlanCardPlan | undefined)[],
  rates: readonly PlanCardRate[] | undefined,
): { of: (plan: PlanCardPlan | undefined) => CardLines; payg: (plan: PlanCardPlan) => CardLines } {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const builder = useMemo(() => new PlanCardLines(language), [language]);
  const shown = plans.filter((plan): plan is PlanCardPlan => plan !== undefined);
  const flags: PlanCardFlags = builder.flagsOf(shown);
  return {
    of: (plan) => (plan ? builder.card(plan, flags) : { lines: [], more: [] }),
    payg: (plan) => {
      const card = builder.card(plan, flags);
      const fees = builder.paygFees(rates ?? null).map((text) => ({ text, on: true }));
      return { lines: [...fees, ...card.lines], more: card.more };
    },
  };
}

/** The outline button on the dark suggested card reads white (the prototype's `.ux-plan.hot .btn.o`). */
export const HOT_OUTLINE = '!border-white/60 !bg-transparent !text-white';
