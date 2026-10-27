import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AuditResult, Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { ListActivityDto } from '../dto/activity.dto';
import { ActivityPageDto } from '../dto/activity-response.dto';
import { ActivityListService } from '../services/activity-list.service';
import type { ActivityPageView } from '../types/activity-view';

// AUD-04, AUD-05: the owner and anyone with audit:read read their own shop's log, filtered and paginated.
@ApiTags('Activity')
@Controller('activity')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ActivityController {
  constructor(@Inject(ActivityListService) private readonly activity: ActivityListService) {}

  @Get()
  @RequirePermission(Permission.AuditRead)
  @ResponseMessage('ActivityListed')
  @ApiOperation({ summary: "List the shop's activity log" })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({
    name: 'action',
    required: false,
    type: String,
    description: 'One action or several, comma-separated',
  })
  @ApiQuery({ name: 'result', required: false, enum: AuditResult })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ZodResponse({ type: ActivityPageDto })
  list(
    @Query(new ZodValidationPipe(ListActivityDto.schema)) query: ListActivityDto,
    @Req() request: DashboardRequest,
  ): Promise<ActivityPageView> {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return this.activity.list({ id: tenant.id, planLimits: tenant.planLimits }, query);
  }
}
