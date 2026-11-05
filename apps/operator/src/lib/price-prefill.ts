import type { BillingTerm, PlanPrice } from '@/types/operator';

/**
 * TRM-03: what a plan's empty cell starts at when a term carries a default discount: the plan's monthly price on its
 * shortest shorter priced term, for this term's months, less the discount, in whole taka. Only ever a start: the stored
 * price is what counts. Null when there is nothing to work it out from.
 */
export function prefilledPrice(
  term: BillingTerm,
  terms: readonly BillingTerm[],
  prices: readonly PlanPrice[],
): number | null {
  const discount = Number(term.defaultDiscountPct ?? 0);
  if (discount <= 0) return null;
  const base = terms
    .filter((each) => each.months < term.months)
    .sort((a, b) => a.months - b.months)
    .find((each) => prices.some((price) => price.billingTermId === each.id));
  const basePrice = base && prices.find((price) => price.billingTermId === base.id);
  if (!base || !basePrice) return null;
  const monthly = Number(basePrice.price) / base.months;
  return Math.floor(monthly * term.months * (1 - discount / 100));
}
