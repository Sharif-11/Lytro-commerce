import { Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { CatalogFeedService } from '../../public-api/services/catalog-feed.service';
import type { CatalogFeedView } from '../../public-api/types/public-api';
import { CatalogFeedViewDto } from '../dto/ad-tracking.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// FED-01, FED-05, FED-06: the shop's Meta catalog feed link, a secret, behind settings:manage.
@ApiTags('Catalog feed')
@Controller('catalog-feed')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class CatalogFeedController {
  constructor(
    @Inject(CatalogFeedService) private readonly feeds: CatalogFeedService,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('CatalogFeedRetrieved')
  @ApiOperation({
    summary:
      "The shop's catalog feed link for Meta Commerce Manager, made on first asking (FED-01, FED-06)",
  })
  @ZodResponse({ type: CatalogFeedViewDto })
  get(@Req() request: DashboardRequest): Promise<CatalogFeedView> {
    return this.feeds.link(this.request.tenantIdOf(request));
  }

  @Post('regenerate')
  @HttpCode(200)
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('CatalogFeedRegenerated')
  @ApiOperation({
    summary: 'A new feed link; the old one answers 404 from now on; in the activity log (FED-05)',
  })
  @ZodResponse({ type: CatalogFeedViewDto })
  regenerate(@Req() request: DashboardRequest): Promise<CatalogFeedView> {
    return this.feeds.regenerate(this.request.tenantIdOf(request), this.request.actorOf(request));
  }
}
