import { Inject, Injectable } from '@nestjs/common';
import { AddonKind, isUsageLimitKey } from '@lytronix/validators';
import { AddonPurchaseService } from '../../billing/services/addon-purchase.service';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import { PlansService } from '../../billing/services/plans.service';
import type { AddonOffer } from '../../billing/types/addon';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import type { Suggestions, UsageFigure } from '../types/usage';
import { anyNear, suggest, type AddonOption, type PlanOption } from './suggest';

/** PLN-13: the limit add-ons the shop can buy now -- each offered with a price -- by their monthly price. */
function addonOptions(offers: readonly AddonOffer[]): AddonOption[] {
  return offers.flatMap(({ addon, price }) =>
    price !== null &&
    addon.kind === AddonKind.Limit &&
    addon.limitKey !== null &&
    isUsageLimitKey(addon.limitKey) &&
    addon.unitSize !== null
      ? [
          {
            addonId: addon.id,
            key: addon.key,
            name: addon.labelEn,
            limitKey: addon.limitKey,
            unitSize: addon.unitSize,
            monthly: Math.round(Number(addon.price)),
          },
        ]
      : [],
  );
}

/**
 * LIM-01: the plans for sale, each priced by the shortest visible term that prices it (BIL-01), and the limit add-ons
 * the shop can buy on its own plan (PLN-13), for `suggest` to choose from. Read only when some metric is near its
 * limit.
 */
@Injectable()
export class UsageSuggestions {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(AddonPurchaseService) private readonly addons: AddonPurchaseService,
  ) {}

  async for(tenant: TenantSummary, figures: readonly UsageFigure[]): Promise<Suggestions | null> {
    if (!anyNear(figures)) return null;
    const [plans, terms, offers] = await Promise.all([
      this.plans.listForSale(),
      this.terms.listVisibleFor(tenant.id),
      this.addons.offers(tenant.id),
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
    // Add-ons are judged by the shop's own plan's price a month, priced the same way as every other plan here.
    const own = options.find((option) => option.planId === tenant.planId);
    return suggest(
      figures,
      { rank: current?.rank ?? null },
      options,
      own ? { planMonthly: own.price / own.months, addons: addonOptions(offers) } : null,
    );
  }
}
