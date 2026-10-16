import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { MeResponseDto } from '../dto/me-response.dto';
import { DashboardGuard, type DashboardRequest } from '../guards/dashboard.guard';
import { SessionGuard } from '../guards/session.guard';
import { StaffService } from '../../staff/services/staff.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';

export interface MeResponse {
  subscriber: { id: string };
  /** `session.userId === null` (PermissionGuard's own test) — the owner implicitly holds every permission,
      so the frontend should treat this as "show everything" rather than checking `permissions` at all. */
  isOwner: boolean;
  /** Only meaningful when `isOwner` is false — the permission strings this signed-in staff member holds
      right now (STF-10/11), for client-side nav filtering (D32). Always `[]` for the owner. */
  permissions: string[];
  tenant: {
    id: string;
    slug: string;
    shopName: string;
    state: TenantSummary['state'];
    suspended: boolean;
    planName: string | null;
    periodEnd: string | null;
  } | null;
}

// The dashboard shell's account summary.
// LIF-24 (decided 2026-10-16): also carries `suspendedOwner: true` -- the owner needs /me to succeed while
// suspended so the dashboard shell can render the narrow suspended view instead of a dead end.
@ApiTags('Me')
@Controller('me')
@Dashboard({ lapsed: true, suspendedOwner: true, withoutShop: true })
@UseGuards(SessionGuard, DashboardGuard)
export class MeController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  @ResponseMessage('ProfileRetrieved')
  @ApiOperation({ summary: 'Get the signed-in account and tenant summary' })
  @ZodResponse({ type: MeResponseDto })
  async get(@Req() request: DashboardRequest): Promise<MeResponse> {
    const tenant = request.tenant ?? null;
    const userId = request.session?.userId ?? null;
    const isOwner = userId === null;
    const permissions =
      isOwner || tenant === null ? [] : ((await this.staff.permissionsOf(tenant, userId)) ?? []);
    return {
      subscriber: { id: request.session?.subscriberId ?? '' },
      isOwner,
      permissions,
      tenant:
        tenant === null
          ? null
          : {
              id: tenant.id,
              slug: tenant.slug,
              shopName: tenant.shopName,
              state: tenant.state,
              suspended: tenant.suspendedAt !== null,
              planName: tenant.planName,
              periodEnd: tenant.periodEnd?.toISOString() ?? null,
            },
    };
  }
}
