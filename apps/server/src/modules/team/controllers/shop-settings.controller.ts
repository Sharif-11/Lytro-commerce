import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission, type ShopSettings } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { ShopSettingsService } from '../services/shop-settings.service';
import { ShopSettingsDto, UpdateShopSettingsDto } from '../dto/shop-settings.dto';

// TEN-30: a tenant's own support/contact details -- reachable only once a shop exists, never a step of
// sign-up/create-shop (AUTH-11/AUTH-28). Not reachable while lapsed or suspended: no SRS row names this as
// one of the owner's narrow lapsed/suspended-owner carve-outs (BIL-13/LIF-11/LIF-12/LIF-24), so it stays
// behind the plain guard like most other dashboard routes.
@ApiTags('Shop settings')
@Controller('shop-settings')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ShopSettingsController {
  constructor(@Inject(ShopSettingsService) private readonly settings: ShopSettingsService) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('ShopSettingsRetrieved')
  @ApiOperation({ summary: "Get the shop's contact details" })
  @ZodResponse({ type: ShopSettingsDto })
  get(@Req() request: DashboardRequest): Promise<ShopSettings> {
    return this.settings.get(this.tenantIdOf(request));
  }

  @Patch()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('ShopSettingsUpdated')
  @ApiOperation({ summary: "Update the shop's contact details" })
  @ZodResponse({ type: ShopSettingsDto })
  update(
    @Body(new ZodValidationPipe(UpdateShopSettingsDto.schema)) body: UpdateShopSettingsDto,
    @Req() request: DashboardRequest,
  ): Promise<ShopSettings> {
    return this.settings.update(this.tenantIdOf(request), request.session?.userId ?? null, body);
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
