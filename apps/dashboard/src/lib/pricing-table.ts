import type { BillingTerm, Plan, PlanPrice } from '@/types/billing';

export interface PricedOption {
  plan: Plan;
  term: BillingTerm;
  price: number;
  /** price ÷ months, whole taka (TRM-12). */
  monthly: number;
  /** Saving against the plan's shortest term, in whole percent; 0 on that term itself. */
  savingPercent: number;
}

/** One calculation for every figure the checkout and the plan picker show (ENGINEERING-STANDARDS §4). */
export class PricingTable {
  private readonly options: PricedOption[];

  constructor(plans: Plan[], terms: BillingTerm[], prices: PlanPrice[]) {
    const visibleTerms = terms
      .filter((term) => term.visible)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const shortest = [...visibleTerms].sort((a, b) => a.months - b.months)[0];
    const priceOf = (planId: string, termId: string): number | null => {
      const row = prices.find((p) => p.planId === planId && p.billingTermId === termId);
      if (!row) return null;
      const value = Number(row.price);
      return Number.isFinite(value) ? value : null;
    };
    this.options = [];
    for (const plan of plans.filter((p) => p.forSale).sort((a, b) => a.rank - b.rank)) {
      const base = shortest ? priceOf(plan.id, shortest.id) : null;
      const baseMonthly = shortest && base !== null ? base / shortest.months : null;
      for (const term of visibleTerms) {
        const price = priceOf(plan.id, term.id);
        if (price === null) continue;
        const monthly = Math.round(price / term.months);
        const isBase = shortest !== undefined && term.id === shortest.id;
        const savingPercent =
          !isBase && baseMonthly !== null && baseMonthly > 0
            ? Math.max(0, Math.round((1 - price / term.months / baseMonthly) * 100))
            : 0;
        this.options.push({ plan, term, price, monthly, savingPercent });
      }
    }
  }

  plans(): Plan[] {
    const seen = new Map<string, Plan>();
    for (const option of this.options) seen.set(option.plan.id, option.plan);
    return [...seen.values()];
  }

  termsFor(planId: string): BillingTerm[] {
    return this.options.filter((o) => o.plan.id === planId).map((o) => o.term);
  }

  option(planId: string, termId: string): PricedOption | null {
    return this.options.find((o) => o.plan.id === planId && o.term.id === termId) ?? null;
  }

  /** The first priced option for a plan: the shortest term. */
  defaultOption(planId: string): PricedOption | null {
    const own = this.options.filter((o) => o.plan.id === planId);
    return [...own].sort((a, b) => a.term.months - b.term.months)[0] ?? null;
  }

  /** The best saving a term offers against the shortest one, for the term chips (TRM-12); 0 when none. */
  discountPercent(termId: string): number {
    return Math.max(
      0,
      ...this.options.filter((o) => o.term.id === termId).map((o) => o.savingPercent),
    );
  }

  isEmpty(): boolean {
    return this.options.length === 0;
  }
}
