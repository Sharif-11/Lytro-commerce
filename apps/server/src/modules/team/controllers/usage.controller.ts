import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { UsageService } from '../../usage/services/usage.service';
import type { ShopUsage } from '../../usage/types/usage';
import { PermissionGuard } from '../guards/permission.guard';
import { ShopUsageDto } from '../dto/usage-response.dto';

// LIM-02 over HTTP: the usage page, for whoever may see the shop's billing.
@ApiTags('Usage')
@Controller('usage')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class UsageController {
  constructor(@Inject(UsageService) private readonly usage: UsageService) {}

  @Get()
  @Dashboard({ lapsed: true })
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('UsageRetrieved')
  @ApiOperation({ summary: 'Every metric the shop uses against its limit, and its cycle (LIM-02)' })
  @ZodResponse({ type: ShopUsageDto })
  get(@Req() request: DashboardRequest): Promise<ShopUsage> {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return this.usage.usage(tenant, new Date());
  }
}
