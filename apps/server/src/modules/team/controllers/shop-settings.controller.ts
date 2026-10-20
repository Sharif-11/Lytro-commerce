import { Body, Controller, Get, Inject, Patch, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';
import { ShopSettingsService, type ShopSettingsView } from '../services/shop-settings.service';
import { ShopLogoDto, ShopSettingsDto, UpdateShopSettingsDto } from '../dto/shop-settings.dto';

// TEN-30: a tenant's own support/contact details. RAT-14: the one per-tenant rate (extra delivery charge
// per kg beyond the first, Adjustable-mode products) folded into this same shape -- reachable only once a
// shop exists, never a step of sign-up/create-shop (AUTH-11/AUTH-28). Not reachable while lapsed or
// suspended: no SRS row names this as one of the owner's narrow lapsed/suspended-owner carve-outs
// (BIL-13/LIF-11/LIF-12/LIF-24), so it stays behind the plain guard like most other dashboard routes.
@ApiTags('Shop settings')
@Controller('shop-settings')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ShopSettingsController {
  constructor(
    @Inject(ShopSettingsService) private readonly settings: ShopSettingsService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('ShopSettingsRetrieved')
  @ApiOperation({
    summary: "Get the shop's contact details, delivery rate and logo (RAT-14, TEN-16)",
  })
  @ZodResponse({ type: ShopSettingsDto })
  get(@Req() request: DashboardRequest): Promise<ShopSettingsView> {
    return this.settings.get(this.tenantIdOf(request));
  }

  @Patch()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('ShopSettingsUpdated')
  @ApiOperation({ summary: "Update the shop's contact details and delivery rate (RAT-14)" })
  @ZodResponse({ type: ShopSettingsDto })
  update(
    @Body(new ZodValidationPipe(UpdateShopSettingsDto.schema)) body: UpdateShopSettingsDto,
    @Req() request: DashboardRequest,
  ): Promise<ShopSettingsView> {
    return this.settings.update(
      this.tenantIdOf(request),
      request.session?.userId ?? null,
      body,
      this.clientIp.resolve(request),
    );
  }

  @Put('logo')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('ShopLogoSaved')
  @ApiOperation({
    summary: "Set the shop's logo to one of its ready images, or null for its monogram (TEN-16)",
  })
  @ApiBody({ type: ShopLogoDto })
  @ZodResponse({ type: ShopSettingsDto })
  setLogo(
    @Body(new ZodValidationPipe(ShopLogoDto.schema)) body: ShopLogoDto,
    @Req() request: DashboardRequest,
  ): Promise<ShopSettingsView> {
    return this.settings.setLogo(
      this.tenantIdOf(request),
      body.mediaId,
      this.catalogue.actorOf(request),
    );
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
