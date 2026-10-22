import { Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { OkDto } from '../../../common/dto/ok.dto';
import { HomeViewDto } from '../dto/home-response.dto';
import { HomeService } from '../services/home.service';
import type { HomeView } from '../types/home';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';

// TENANT-DASHBOARD-DESIGN §7.1, SUP-01: Home in one read, and the checklist's "link shared". Every member may call
// both, like GET /me: Home holds only the parts the caller's permissions reach (STF-11), and copying the shop's link
// is something any member does.
@ApiTags('Home')
@Controller('home')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard)
export class HomeController {
  constructor(@Inject(HomeService) private readonly home: HomeService) {}

  @Get()
  @ResponseMessage('HomeRetrieved')
  @ApiOperation({
    summary: "Home's job counts, figures and set-up checklist, as far as the caller may see",
  })
  @ZodResponse({ type: HomeViewDto })
  get(@Req() request: DashboardRequest): Promise<HomeView> {
    return this.home.view(this.tenantOf(request), request.session?.userId ?? null);
  }

  @Post('link-shared')
  @HttpCode(200)
  @ResponseMessage('LinkShareRecorded')
  @ApiOperation({ summary: 'Record that a shop or product link was copied or shared (SUP-01)' })
  @ZodResponse({ type: OkDto })
  async linkShared(@Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.home.recordLinkShared(this.tenantOf(request).id);
    return { ok: true };
  }

  private tenantOf(request: DashboardRequest): TenantSummary {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return tenant;
  }
}
