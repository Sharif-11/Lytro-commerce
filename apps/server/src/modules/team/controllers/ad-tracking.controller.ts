import { Body, Controller, Delete, Get, Inject, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { AdTrackingService } from '../../public-api/services/ad-tracking.service';
import type { AdTrackingView } from '../../public-api/types/public-api';
import { AdTrackingViewDto, UpdateAdTrackingDto } from '../dto/ad-tracking.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// LND-15 to LND-17: the shop's Meta ad tracking, behind settings:manage. The Conversions API token goes in and never
// comes back out.
@ApiTags('Ad tracking')
@Controller('ad-tracking')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class AdTrackingController {
  constructor(
    @Inject(AdTrackingService) private readonly adTracking: AdTrackingService,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('AdTrackingRetrieved')
  @ApiOperation({
    summary:
      'The Meta Pixel ID, and whether a Conversions API token is set (never the token) (LND-17)',
  })
  @ZodResponse({ type: AdTrackingViewDto })
  get(@Req() request: DashboardRequest): Promise<AdTrackingView> {
    return this.adTracking.view(this.request.tenantIdOf(request));
  }

  @Put()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('AdTrackingSaved')
  @ApiOperation({
    summary:
      'Connect or change the Meta Pixel (null disconnects it) and the Conversions API token (left out keeps it, null ' +
      'removes it); in the activity log (LND-15 to LND-17)',
  })
  @ApiBody({ type: UpdateAdTrackingDto })
  @ZodResponse({ type: AdTrackingViewDto })
  update(
    @Body(new ZodValidationPipe(UpdateAdTrackingDto.schema)) body: UpdateAdTrackingDto,
    @Req() request: DashboardRequest,
  ): Promise<AdTrackingView> {
    return this.adTracking.update(
      this.request.tenantIdOf(request),
      body,
      this.request.actorOf(request),
    );
  }

  @Delete()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('AdTrackingRemoved')
  @ApiOperation({
    summary: 'Disconnect the Pixel and remove the token; in the activity log (LND-17)',
  })
  @ZodResponse({ type: OkDto })
  async remove(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.adTracking.remove(this.request.tenantIdOf(request), this.request.actorOf(request));
    return { ok: true };
  }
}
