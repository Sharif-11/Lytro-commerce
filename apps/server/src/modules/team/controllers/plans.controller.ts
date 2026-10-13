import { Controller, Get, Inject } from '@nestjs/common';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { PlansService } from '../../billing/services/plans.service';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import type { PlanRecord } from '../../billing/types/plan';
import type { BillingTermRecord } from '../../billing/types/billing-term';

// PLN-10, TRM-02/13, D2-12: platform-wide data, reachable by an anonymous marketing-site visitor and a
// signed-in tenant alike -- no key or session, the same reason sign-up endpoints skip tenant resolution.
@Controller()
@SkipTenant()
export class PlansController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
  ) {}

  @Get('plans')
  listPlans(): Promise<PlanRecord[]> {
    return this.plans.listForSale();
  }

  @Get('billing-terms')
  listBillingTerms(): Promise<BillingTermRecord[]> {
    // No tenant context here -- an anonymous/platform-host caller only ever sees platform-wide terms,
    // never one scoped to a specific tenant (TRM-14).
    return this.terms.listVisibleFor(null);
  }
}
