import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { AddonPurchaseService } from '../../billing/services/addon-purchase.service';
import type {
  AddonOffer,
  AddonPurchaseResult,
  AddonQuote,
  ShopAddons,
} from '../../billing/types/addon';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import {
  AddonOfferListDto,
  AddonPurchaseResultDto,
  AddonQuoteDto,
  ShopAddonsDto,
} from '../dto/addons-response.dto';
import { ConfirmAddonDto, QuoteAddonDto } from '../dto/billing.dto';

// PLN-13, PLN-14, BRN-05: a shop's add-ons -- what is for sale and at what price, buying one from the balance, and
// what the shop has now. Paying by wallet follows in Slice 10a.2.
@ApiTags('Add-ons')
@Controller('addons')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class AddonsController {
  constructor(
    @Inject(AddonPurchaseService) private readonly addons: AddonPurchaseService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('AddonsListed')
  @ApiOperation({ summary: 'List the add-ons for sale, each priced to the period end' })
  @ZodResponse({ type: AddonOfferListDto })
  offers(@Req() request: DashboardRequest): Promise<AddonOffer[]> {
    return this.addons.offers(this.tenantIdOf(request));
  }

  @Get('mine')
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('ShopAddonsRetrieved')
  @ApiOperation({ summary: "The shop's active add-ons and its brand identity entitlement" })
  @ZodResponse({ type: ShopAddonsDto })
  mine(@Req() request: DashboardRequest): Promise<ShopAddons> {
    return this.addons.mine(this.tenantIdOf(request));
  }

  @Post('quote')
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('AddonQuoted')
  @ApiOperation({ summary: 'Quote an add-on for the rest of the period' })
  @ZodResponse({ type: AddonQuoteDto })
  quote(
    @Body(new ZodValidationPipe(QuoteAddonDto.schema)) body: QuoteAddonDto,
    @Req() request: DashboardRequest,
  ): Promise<AddonQuote> {
    return this.addons.quote(this.tenantIdOf(request), body);
  }

  @Post('purchase')
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('AddonPurchased')
  @ApiOperation({ summary: 'Pay a quoted add-on from the balance' })
  @ZodResponse({ type: AddonPurchaseResultDto })
  purchase(
    @Body(new ZodValidationPipe(ConfirmAddonDto.schema)) body: ConfirmAddonDto,
    @Req() request: DashboardRequest,
  ): Promise<AddonPurchaseResult> {
    return this.addons.confirmFromBalance(
      body.paymentId,
      this.tenantIdOf(request),
      this.clientIp.resolve(request),
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
