import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { PlansService } from '../../billing/services/plans.service';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import type { PlanRecord } from '../../billing/types/plan';
import type { BillingTermRecord } from '../../billing/types/billing-term';
import { BillingTermListDto, PlanListDto } from '../dto/billing-response.dto';

// PLN-10, TRM-02/13, D2-12: platform-wide data, reachable by an anonymous marketing-site visitor and a
// signed-in tenant alike -- no key or session, the same reason sign-up endpoints skip tenant resolution.
@ApiTags('Plans')
@Controller()
@SkipTenant()
export class PlansController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
  ) {}

  @Get('plans')
  @ResponseMessage('PlansListed')
  @ApiOperation({ summary: 'List plans for sale' })
  @ZodResponse({ type: PlanListDto })
  listPlans(): Promise<PlanRecord[]> {
    return this.plans.listForSale();
  }

  @Get('billing-terms')
  @ResponseMessage('BillingTermsListed')
  @ApiOperation({ summary: 'List platform-wide billing terms' })
  @ZodResponse({ type: BillingTermListDto })
  listBillingTerms(): Promise<BillingTermRecord[]> {
    // No tenant context here -- an anonymous/platform-host caller only ever sees platform-wide terms,
    // never one scoped to a specific tenant (TRM-14).
    return this.terms.listVisibleFor(null);
  }
}
