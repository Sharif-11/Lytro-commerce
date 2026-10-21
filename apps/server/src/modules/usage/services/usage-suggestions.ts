import { Inject, Injectable } from '@nestjs/common';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import { PlansService } from '../../billing/services/plans.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import type { Suggestions, UsageFigure } from '../types/usage';
import { anyNear, suggest, type PlanOption } from './suggest';

/**
 * LIM-01: the plans for sale, each priced by the shortest visible term that prices it (BIL-01), for `suggest` to choose
 * from. Read only when some metric is near its limit.
 */
@Injectable()
export class UsageSuggestions {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
  ) {}

  async for(tenant: TenantSummary, figures: readonly UsageFigure[]): Promise<Suggestions | null> {
    if (!anyNear(figures)) return null;
    const [plans, terms] = await Promise.all([
      this.plans.listForSale(),
      this.terms.listVisibleFor(tenant.id),
    ]);
    const shortestFirst = [...terms].sort((a, b) => a.months - b.months);
    const options: PlanOption[] = [];
    for (const plan of plans) {
      const prices = new Map(
        (await this.terms.listPricesForPlan(plan.id)).map((p) => [p.billingTermId, p.price]),
      );
      const term = shortestFirst.find((candidate) => prices.has(candidate.id));
      const price = term && prices.get(term.id);
      if (!term || price === undefined) continue;
      options.push({
        planId: plan.id,
        name: plan.name,
        rank: plan.rank,
        limits: plan.limits,
        price: Math.round(Number(price)),
        months: term.months,
      });
    }
    const current = plans.find((plan) => plan.id === tenant.planId);
    return suggest(figures, { rank: current?.rank ?? null }, options);
  }
}
