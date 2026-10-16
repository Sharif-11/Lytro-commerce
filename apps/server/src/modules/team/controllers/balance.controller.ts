import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ZodResponse } from 'nestjs-zod';
import { LedgerEntryType, Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { BalanceService } from '../../balance/services/balance.service';
import { RateService } from '../../balance/services/rate.service';
import { TopUpService } from '../../balance/services/top-up.service';
import type { BalanceSnapshot, LedgerPage } from '../../balance/types/ledger-entry';
import type { RateValue } from '../../balance/types/rate';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { ConfirmTopUpDto, ListLedgerDto, QuoteTopUpDto } from '../dto/balance.dto';
import { BalanceSnapshotDto, LedgerPageDto, RateValueDto } from '../dto/balance-response.dto';
import { PlanPaymentDto } from '../dto/billing-response.dto';

// BAL-01, BAL-08, BAL-14, RAT-06: a tenant's own balance, statement and current rates.
// BAL-18: `current` carries `lapsed: true` so the frozen balance is still shown to the owner after lapse or
// deletion; DashboardGuard's own lapsed carve-out already restricts this to the owner session, never staff.
// LIF-24 (decided 2026-10-16): `current` and both top-up routes also carry `suspendedOwner: true`, since
// topping up to pay off a suspension is exactly the "activity that benefits the operator side" a suspended
// owner is meant to still reach -- `ledger` and `current-rates` deliberately do not, since viewing past
// transactions or platform rates is not.
@ApiTags('Balance')
@Controller('balance')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class BalanceController {
  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(TopUpService) private readonly topUp: TopUpService,
  ) {}

  @Get()
  @Dashboard({ lapsed: true, suspendedOwner: true })
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('BalanceRetrieved')
  @ApiOperation({ summary: "Get the shop's current balance" })
  @ZodResponse({ type: BalanceSnapshotDto })
  current(@Req() request: DashboardRequest): Promise<BalanceSnapshot> {
    return this.balance.current(this.tenantIdOf(request));
  }

  @Get('ledger')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('LedgerRetrieved')
  @ApiOperation({ summary: "Get the shop's balance statement" })
  @ApiQuery({ name: 'type', required: false, enum: LedgerEntryType })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ZodResponse({ type: LedgerPageDto })
  ledger(
    @Query(new ZodValidationPipe(ListLedgerDto.schema)) query: ListLedgerDto,
    @Req() request: DashboardRequest,
  ): Promise<LedgerPage> {
    return this.balance.statement(
      this.tenantIdOf(request),
      { type: query.type, dateFrom: query.dateFrom, dateTo: query.dateTo },
      query.cursor ?? null,
      query.limit,
    );
  }

  @Get('current-rates')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('RatesRetrieved')
  @ApiOperation({ summary: 'Get the current platform rates' })
  @ZodResponse({ type: [RateValueDto] })
  currentRates(): Promise<RateValue[]> {
    return this.rates.list();
  }

  @Post('top-up/quote')
  @Dashboard({ suspendedOwner: true })
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('TopUpQuoted')
  @ApiOperation({ summary: 'Quote a balance top-up' })
  @ApiBody({ type: QuoteTopUpDto })
  @ZodResponse({ type: PlanPaymentDto })
  quoteTopUp(
    @Body(new ZodValidationPipe(QuoteTopUpDto.schema)) body: QuoteTopUpDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    return this.topUp.quote(this.tenantIdOf(request), body.amount.toFixed(2));
  }

  @Post('top-up/confirm')
  @Dashboard({ suspendedOwner: true })
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('TopUpConfirmed')
  @ApiOperation({ summary: 'Submit a wallet payment for a top-up' })
  @ApiBody({ type: ConfirmTopUpDto })
  @ZodResponse({ type: PlanPaymentDto })
  confirmTopUp(
    @Body(new ZodValidationPipe(ConfirmTopUpDto.schema)) body: ConfirmTopUpDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    return this.topUp.submit(body.paymentId, this.tenantIdOf(request), {
      transactionId: body.transactionId,
      senderNumber: body.senderNumber,
      amountPaid: body.amountPaid.toFixed(2),
    });
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
