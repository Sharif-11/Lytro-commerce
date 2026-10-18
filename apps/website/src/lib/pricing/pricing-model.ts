import type { BillingTerm, Plan, PlanCatalogue } from '../api/plans-api';

/** Money on the site is shown as whole taka with the sign first and three-digit grouping, `৳4,741`
    (BRAND-IDENTITY §5). Western digits in both languages. */
export function formatTaka(amount: number): string {
  return `৳${Math.round(amount).toLocaleString('en-US')}`;
}

export interface PricedTerm {
  term: BillingTerm;
  price: number;
  /** price ÷ months, rounded to whole taka (TRM-12). */
  monthly: number;
  /** Saving against the shortest visible term, in whole percent; 0 for the shortest term itself. */
  savingPercent: number;
}

export interface PricedPlan {
  plan: Plan;
  terms: PricedTerm[];
}

/** Turns the raw catalogue into what the pricing cards show: every figure computed here, none typed into a
    component (PLN-12, TRM-12). The same model drives the monthly/yearly toggle. */
export class PricingModel {
  readonly plans: PricedPlan[];
  readonly terms: BillingTerm[];

  constructor(catalogue: PlanCatalogue) {
    this.terms = catalogue.terms;
    const shortest = PricingModel.shortestTerm(catalogue.terms);
    const priceOf = (planId: string, termId: string): number | null => {
      const row = catalogue.prices.find(
        (price) => price.planId === planId && price.billingTermId === termId,
      );
      if (!row) return null;
      const price = Number(row.price);
      return Number.isFinite(price) ? price : null;
    };

    this.plans = catalogue.plans
      .map((plan): PricedPlan => {
        const basePrice = shortest ? priceOf(plan.id, shortest.id) : null;
        const baseMonthly = shortest && basePrice !== null ? basePrice / shortest.months : null;
        const priced = catalogue.terms
          .map((term): PricedTerm | null => {
            const price = priceOf(plan.id, term.id);
            if (price === null) return null;
            const monthly = Math.round(price / term.months);
            const isBase = shortest !== undefined && term.id === shortest.id;
            const savingPercent =
              !isBase && baseMonthly !== null && baseMonthly > 0
                ? Math.max(0, Math.round((1 - price / term.months / baseMonthly) * 100))
                : 0;
            return { term, price, monthly, savingPercent };
          })
          .filter((item): item is PricedTerm => item !== null);
        return { plan, terms: priced };
      })
      // A plan with no priced visible term is not purchasable and is not shown (TRM-13).
      .filter((item) => item.terms.length > 0);
  }

  /** The default term to show first: the shortest one, so the headline price is the monthly one. */
  defaultTermId(): string | null {
    return PricingModel.shortestTerm(this.terms)?.id ?? null;
  }

  /** The term with the biggest saving, for the toggle's second position. */
  bestValueTermId(): string | null {
    let best: PricedTerm | null = null;
    for (const plan of this.plans) {
      for (const priced of plan.terms) {
        if (!best || priced.savingPercent > best.savingPercent) best = priced;
      }
    }
    return best ? best.term.id : null;
  }

  private static shortestTerm(terms: BillingTerm[]): BillingTerm | undefined {
    return [...terms].sort((a, b) => a.months - b.months)[0];
  }
}
