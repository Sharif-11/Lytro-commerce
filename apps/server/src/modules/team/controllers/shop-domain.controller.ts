import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DomainService, type DomainShop } from '../../domains/services/domain.service';
import type { DomainView } from '../../domains/types/domain';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { AddDomainDto, DomainViewDto } from '../dto/shop-domain.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// TEN-09 to TEN-14 (Slice 13): the Domain page's routes, for whoever manages the shop's settings. Like the rest of
// Settings, not reachable while lapsed or suspended.
@ApiTags('Shop domain')
@Controller('domain')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ShopDomainController {
  constructor(
    @Inject(DomainService) private readonly domains: DomainService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DomainRetrieved')
  @ApiOperation({
    summary:
      "The shop's own domain, its state and the records to add, and whether its plan includes one (TEN-09)",
  })
  @ZodResponse({ type: DomainViewDto })
  get(@Req() request: DashboardRequest): Promise<DomainView> {
    return this.domains.view(this.shopOf(request));
  }

  @Post()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DomainAdded')
  @ApiOperation({
    summary:
      "Add the shop's own domain, which waits for its records and is checked at once (TEN-09 to TEN-12)",
  })
  @ApiBody({ type: AddDomainDto })
  @ZodResponse({ type: DomainViewDto, status: 201 })
  add(
    @Body(new ZodValidationPipe(AddDomainDto.schema)) body: AddDomainDto,
    @Req() request: DashboardRequest,
  ): Promise<DomainView> {
    return this.domains.add(this.shopOf(request), body, this.catalogue.actorOf(request));
  }

  @Post('check')
  @HttpCode(200)
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DomainChecked')
  @ApiOperation({
    summary:
      "Check a waiting domain's records now; one that could not be verified starts its 72 hours over (TEN-11)",
  })
  @ZodResponse({ type: DomainViewDto })
  check(@Req() request: DashboardRequest): Promise<DomainView> {
    return this.domains.check(this.shopOf(request));
  }

  @Delete()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DomainRemoved')
  @ApiOperation({
    summary:
      "Remove the shop's own domain: it stops answering at once, the shop's address keeps working (TEN-14)",
  })
  @ZodResponse({ type: DomainViewDto })
  remove(@Req() request: DashboardRequest): Promise<DomainView> {
    return this.domains.remove(this.shopOf(request), this.catalogue.actorOf(request));
  }

  private shopOf(request: DashboardRequest): DomainShop {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return { id: tenant.id, slug: tenant.slug };
  }
}
