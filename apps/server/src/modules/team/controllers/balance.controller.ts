import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ZodResponse } from 'nestjs-zod';
import { LedgerEntryType, limitOf, Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { toCsv } from '../../../common/csv';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { BalanceService } from '../../balance/services/balance.service';
import { RateService } from '../../balance/services/rate.service';
import { TopUpService } from '../../balance/services/top-up.service';
import { EssentialSmsUsageService } from '../../sms-usage/services/essential-sms-usage.service';
import type { BalanceView, LedgerPage } from '../../balance/types/ledger-entry';
import type { RateValue } from '../../balance/types/rate';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { ConfirmTopUpDto, ExportLedgerDto, ListLedgerDto, QuoteTopUpDto } from '../dto/balance.dto';
import {
  BalanceViewDto,
  EssentialSmsUsageDto,
  LedgerPageDto,
  RateValueDto,
} from '../dto/balance-response.dto';
import { PlanPaymentDto } from '../dto/billing-response.dto';

// BAL-14: the raw response object the CSV export route writes to directly -- same narrow local shape
// `DataExportController`'s own download route already uses, not express's own type.
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string): void;
}

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
    @Inject(EssentialSmsUsageService) private readonly smsUsage: EssentialSmsUsageService,
  ) {}

  @Get()
  @Dashboard({ lapsed: true, suspendedOwner: true })
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('BalanceRetrieved')
  @ApiOperation({ summary: "Get the shop's current balance" })
  @ZodResponse({ type: BalanceViewDto })
  async current(@Req() request: DashboardRequest): Promise<BalanceView> {
    const [snapshot, bounds] = await Promise.all([
      this.balance.current(this.tenantIdOf(request)),
      this.topUp.bounds(),
    ]);
    return { ...snapshot, topUpMin: bounds.min, topUpMax: bounds.max };
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

  @Get('ledger/export')
  @RequirePermission(Permission.BalanceRead)
  @ApiOperation({ summary: "Download the shop's balance statement as CSV (BAL-14)" })
  @ApiQuery({ name: 'type', required: false, enum: LedgerEntryType })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  async exportLedger(
    @Query(new ZodValidationPipe(ExportLedgerDto.schema)) query: ExportLedgerDto,
    @Req() request: DashboardRequest,
    @Res() response: RawResponse,
  ): Promise<void> {
    const entries = await this.balance.statementAll(this.tenantIdOf(request), {
      type: query.type,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    const csv = toCsv(
      entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount,
        units: entry.units,
        rateUsed: entry.rateUsed,
        balanceAfter: entry.balanceAfter,
        createdAt: entry.createdAt.toISOString(),
      })),
      ['id', 'type', 'amount', 'units', 'rateUsed', 'balanceAfter', 'createdAt'],
    );
    response
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="balance-statement.csv"',
      })
      .send(csv);
  }

  @Get('current-rates')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('RatesRetrieved')
  @ApiOperation({ summary: 'Get the current platform rates' })
  @ZodResponse({ type: [RateValueDto] })
  currentRates(): Promise<RateValue[]> {
    return this.rates.list();
  }

  @Get('essential-sms')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('EssentialSmsUsageRetrieved')
  @ApiOperation({
    summary: "Get the shop's essential-SMS usage against its plan allowance (AUTH-21)",
  })
  @ZodResponse({ type: EssentialSmsUsageDto })
  async essentialSms(@Req() request: DashboardRequest): Promise<{
    monthlyUsed: number;
    totalUsed: number;
    monthlyLimit: number | null;
    totalLimit: number | null;
  }> {
    const tenantId = this.tenantIdOf(request);
    const usage = await this.smsUsage.currentUsage(tenantId, new Date());
    // PLN-11: the shop's own limits, its overrides laid over its snapshot (e.g. extra free essential SMS).
    const limits = request.tenant?.planLimits ?? null;
    return {
      monthlyUsed: usage.monthly,
      totalUsed: usage.total,
      monthlyLimit: limitOf(limits, 'essential_sms_monthly'),
      totalLimit: limitOf(limits, 'essential_sms_total'),
    };
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
