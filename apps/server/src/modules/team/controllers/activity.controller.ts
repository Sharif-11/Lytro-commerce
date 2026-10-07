import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { ListActivityDto } from '../dto/activity.dto';
import { ActivityListService } from '../services/activity-list.service';
import type { ActivityPageView } from '../types/activity-view';

// AUD-04, AUD-05: the owner and anyone with audit:read read their own shop's log, filtered and paginated.
@Controller('activity')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ActivityController {
  constructor(@Inject(ActivityListService) private readonly activity: ActivityListService) {}

  @Get()
  @RequirePermission(Permission.AuditRead)
  list(
    @Query(new ZodValidationPipe(ListActivityDto.schema)) query: ListActivityDto,
    @Req() request: DashboardRequest,
  ): Promise<ActivityPageView> {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'Create your shop to continue.', { next: 'create-shop' });
    }
    return this.activity.list({ id: tenant.id, planLimits: tenant.planLimits }, query);
  }
}
