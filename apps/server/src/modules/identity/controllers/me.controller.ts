import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Dashboard } from '../../../common/decorators/dashboard';
import { DashboardGuard, type DashboardRequest } from '../guards/dashboard.guard';
import { SessionGuard } from '../guards/session.guard';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';

export interface MeResponse {
  subscriber: { id: string };
  tenant: {
    id: string;
    slug: string;
    shopName: string;
    state: TenantSummary['state'];
    planName: string | null;
    periodEnd: string | null;
  } | null;
}

// The dashboard shell's account summary.
@Controller('me')
@Dashboard({ lapsed: true, withoutShop: true })
@UseGuards(SessionGuard, DashboardGuard)
export class MeController {
  @Get()
  get(@Req() request: DashboardRequest): MeResponse {
    const tenant = request.tenant ?? null;
    return {
      subscriber: { id: request.session?.subscriberId ?? '' },
      tenant:
        tenant === null
          ? null
          : {
              id: tenant.id,
              slug: tenant.slug,
              shopName: tenant.shopName,
              state: tenant.state,
              planName: tenant.planName,
              periodEnd: tenant.periodEnd?.toISOString() ?? null,
            },
    };
  }
}
