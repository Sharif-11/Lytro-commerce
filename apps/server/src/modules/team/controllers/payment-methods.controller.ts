import { Body, Controller, Get, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  isAccountMethod,
  paymentMethodSchemaFor,
  Permission,
  type AccountMethod,
  type PaymentMethodInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import type { PaymentMethodsView } from '../../payment-methods/types/payment-methods';
import { PaymentMethodsViewDto, WalletMethodDto } from '../dto/payment-methods.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// WAL-01 to WAL-07, WAL-14 to WAL-17 (Phase 5 Slice 5.1, read agreed 2026-10-31): the accounts shoppers pay the shop
// into. Staff with wallets:read see them; only the owner changes them, wallets:manage being the owner's alone (WAL-07,
// STF-07 amended), so no staff member can swap in their own number.
@ApiTags('Payment methods')
@Controller('payment-methods')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class PaymentMethodsController {
  constructor(
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.WalletsRead)
  @ResponseMessage('PaymentMethodsRetrieved')
  @ApiOperation({
    summary:
      "The shop's payment methods, each on or off with its accounts, and whether the owner's phone is verified (WAL-01, TVR-01)",
  })
  @ZodResponse({ type: PaymentMethodsViewDto })
  list(@Req() request: DashboardRequest): Promise<PaymentMethodsView> {
    return this.methods.list(this.request.tenantIdOf(request));
  }

  @Put(':method')
  @RequirePermission(Permission.WalletsManage)
  @ResponseMessage('PaymentMethodSaved')
  @ApiOperation({
    summary:
      "Owner only: one method's accounts, the whole list, and whether it is on; a bank's accounts carry the WAL-14 details instead of a number and account type (WAL-01 to WAL-05, WAL-14)",
  })
  @ApiBody({ type: WalletMethodDto })
  @ZodResponse({ type: PaymentMethodsViewDto })
  save(
    @Param('method') method: string,
    @Body() body: unknown,
    @Req() request: DashboardRequest,
  ): Promise<PaymentMethodsView> {
    const known = this.methodOf(method);
    const input = new ZodValidationPipe(paymentMethodSchemaFor(known)).transform(
      body,
    ) as PaymentMethodInput;
    return this.methods.save(
      this.request.tenantIdOf(request),
      known,
      input,
      this.request.actorOf(request),
    );
  }

  private methodOf(raw: string): AccountMethod {
    if (!isAccountMethod(raw)) throw new ApiError('not_found', 'PaymentMethodNotFound', {});
    return raw;
  }
}
