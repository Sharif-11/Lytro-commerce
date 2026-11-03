import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  catalogueIdSchema,
  isAccountMethod,
  paymentMethodSchemaFor,
  Permission,
  type AccountMethod,
  type GatewayCredentialsInput,
  type PaymentMethodInput,
  type PaymentWayInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { GatewayAccounts, type GatewayTestResult } from '../../gateway/services/gateway-accounts';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import type { PaymentMethodsView } from '../../payment-methods/types/payment-methods';
import {
  GatewayCredentialsDto,
  GatewayTestDto,
  PaymentMethodsViewDto,
  PaymentWayDto,
  WalletMethodDto,
} from '../dto/payment-methods.dto';
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
    @Inject(GatewayAccounts) private readonly gateway: GatewayAccounts,
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

  @Put(':method/way')
  @RequirePermission(Permission.WalletsManage)
  @ResponseMessage('PaymentWayChosen')
  @ApiOperation({
    summary:
      "Owner only: how the shop takes this method's money -- automated checkout, listener verification or by hand (PAY-06, agreed 2026-11-03)",
  })
  @ApiBody({ type: PaymentWayDto })
  @ZodResponse({ type: PaymentMethodsViewDto })
  chooseWay(
    @Param('method') method: string,
    @Body(new ZodValidationPipe(PaymentWayDto.schema)) body: PaymentWayInput,
    @Req() request: DashboardRequest,
  ): Promise<PaymentMethodsView> {
    return this.methods.chooseWay(
      this.request.tenantIdOf(request),
      this.methodOf(method),
      body.way,
      this.request.actorOf(request),
    );
  }

  @Put('accounts/:id/gateway')
  @RequirePermission(Permission.WalletsManage)
  @ResponseMessage('GatewayCredentialsSaved')
  @ApiOperation({
    summary:
      "Owner only: an account's gateway credentials, sealed and never returned, and whether they are for the test environment (WAL-09, SEC-08)",
  })
  @ApiBody({ type: GatewayCredentialsDto })
  @ZodResponse({ type: OkDto })
  async saveCredentials(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(GatewayCredentialsDto.schema)) body: GatewayCredentialsInput,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.gateway.save(
      this.request.tenantIdOf(request),
      this.accountIdOf(id),
      body,
      this.request.actorOf(request),
    );
    return { ok: true };
  }

  @Delete('accounts/:id/gateway')
  @RequirePermission(Permission.WalletsManage)
  @ResponseMessage('GatewayCredentialsRemoved')
  @ApiOperation({ summary: "Owner only: an account's gateway credentials removed (WAL-09)" })
  @ZodResponse({ type: OkDto })
  async removeCredentials(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.gateway.remove(
      this.request.tenantIdOf(request),
      this.accountIdOf(id),
      this.request.actorOf(request),
    );
    return { ok: true };
  }

  @Post('accounts/:id/gateway/test')
  @HttpCode(200)
  @RequirePermission(Permission.WalletsManage)
  @ResponseMessage('GatewayTested')
  @ApiOperation({
    summary:
      "Owner only: checks an account's credentials with the gateway, making no payment. bKash allows two such calls an hour (WAL-13)",
  })
  @ZodResponse({ type: GatewayTestDto })
  test(@Param('id') id: string, @Req() request: DashboardRequest): Promise<GatewayTestResult> {
    return this.gateway.test(this.request.tenantIdOf(request), this.accountIdOf(id));
  }

  @Post('accounts/:id/automated')
  @HttpCode(200)
  @RequirePermission(Permission.WalletsManage)
  @ResponseMessage('GatewayAccountSelected')
  @ApiOperation({
    summary:
      "Owner only: this account takes the method's automated payments; it must hold credentials (WAL-10)",
  })
  @ZodResponse({ type: PaymentMethodsViewDto })
  selectAutomated(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<PaymentMethodsView> {
    return this.methods.selectAutomated(
      this.request.tenantIdOf(request),
      this.accountIdOf(id),
      this.request.actorOf(request),
    );
  }

  private accountIdOf(raw: string): string {
    const id = catalogueIdSchema.safeParse(raw);
    if (!id.success) throw new ApiError('not_found', 'PaymentAccountNotFound', {});
    return id.data;
  }

  private methodOf(raw: string): AccountMethod {
    if (!isAccountMethod(raw)) throw new ApiError('not_found', 'PaymentMethodNotFound', {});
    return raw;
  }
}
