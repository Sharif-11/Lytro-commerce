import type { PlanLimits } from '@lytronix/validators';
import type { ServerApi } from './server-api';

// The public, keyless plan catalogue (API-CONTRACT §8, D2-12): for-sale plans, visible billing terms and the
// price of each plan per term. These are the server's own response shapes; `PlanLimits` is the shared one.
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features?: Record<string, boolean>;
}

export interface BillingTerm {
  id: string;
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
}

export interface PlanPrice {
  planId: string;
  billingTermId: string;
  price: string;
}

export interface PlanCatalogue {
  plans: Plan[];
  terms: BillingTerm[];
  prices: PlanPrice[];
}

export class PlansApi {
  constructor(private readonly api: ServerApi) {}

  /** Everything the pricing section needs, or null when the backend cannot be reached. A missing price for
      one plan leaves that plan out rather than failing the whole catalogue. */
  async catalogue(): Promise<PlanCatalogue | null> {
    const [plans, terms] = await Promise.all([
      this.api.get<Plan[]>('/plans'),
      this.api.get<BillingTerm[]>('/billing-terms'),
    ]);
    if (!plans || !terms) return null;
    const forSale = plans.filter((plan) => plan.forSale).sort((a, b) => a.rank - b.rank);
    const priceLists = await Promise.all(
      forSale.map((plan) => this.api.get<PlanPrice[]>(`/plans/${plan.id}/prices`)),
    );
    const prices = priceLists.flatMap((list) => list ?? []);
    return {
      plans: forSale,
      terms: terms.filter((term) => term.visible).sort((a, b) => a.displayOrder - b.displayOrder),
      prices,
    };
  }
}
