import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LytroPaymentPages } from '../../lytro-payments/services/lytro-payment-pages';
import { LytroReceipts } from '../../lytro-receipts/services/lytro-receipts';
import { OpenPlanPaymentPageDto, PlanPaymentPageDto } from '../dto/operator-payment-methods.dto';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ZodResponse } from 'nestjs-zod';
import { LedgerEntryType, limitOf, Permission, PlanPaymentKind } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
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
import { PaymentCancellationService } from '../../billing/services/payment-cancellation.service';
import {
  PaymentEvidence,
  type EvidenceUpload,
} from '../../payment-evidence/services/payment-evidence';
import {
  EvidenceUploadDto,
  EvidenceUploadResponseDto,
  PaymentEvidenceAttachDto,
  PaymentEvidenceSentDto,
} from '../dto/operator-manual-entries.dto';
import { PaymentScreenshotsService } from '../../billing/services/payment-screenshots.service';
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
import { PausedWhileDegraded } from '../../degraded-mode/paused-while-degraded';

// BAL-14: the raw response object the CSV export route writes to directly -- same narrow local shape
// `DataExportController`'s own download route already uses, not express's own type.
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string): void;
}

// The statement's `type` filter: one ledger type or several, comma-separated (`type=order_fee,product_fee`).
const LEDGER_TYPES_QUERY = {
  name: 'type',
  required: false,
  enum: LedgerEntryType,
  isArray: true,
  style: 'form',
  explode: false,
} as const;

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
    @Inject(LytroReceipts) private readonly lytroReceipts: LytroReceipts,
    @Inject(PaymentEvidence) private readonly evidence: PaymentEvidence,
    @Inject(LytroPaymentPages) private readonly pages: LytroPaymentPages,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(TopUpService) private readonly topUp: TopUpService,
    @Inject(EssentialSmsUsageService) private readonly smsUsage: EssentialSmsUsageService,
    @Inject(PaymentCancellationService) private readonly cancellation: PaymentCancellationService,
    @Inject(PaymentScreenshotsService) private readonly screenshots: PaymentScreenshotsService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @Dashboard({ lapsed: true, suspendedOwner: true })
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('BalanceRetrieved')
  @ApiOperation({ summary: "Get the shop's current balance" })
  @ZodResponse({ type: BalanceViewDto })
  async current(@Req() request: DashboardRequest): Promise<BalanceView> {
    const tenantId = this.tenantIdOf(request);
    const [snapshot, bounds, feesThisMonth] = await Promise.all([
      this.balance.current(tenantId),
      this.topUp.bounds(),
      this.balance.feesThisMonth(tenantId),
    ]);
    return { ...snapshot, topUpMin: bounds.min, topUpMax: bounds.max, feesThisMonth };
  }

  @Get('ledger')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('LedgerRetrieved')
  @ApiOperation({ summary: "Get the shop's balance statement" })
  @ApiQuery(LEDGER_TYPES_QUERY)
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
      { types: query.type, dateFrom: query.dateFrom, dateTo: query.dateTo },
      query.cursor ?? null,
      query.limit,
    );
  }

  @Get('ledger/export')
  @PausedWhileDegraded()
  @RequirePermission(Permission.BalanceRead)
  @ApiOperation({ summary: "Download the shop's balance statement as CSV (BAL-14)" })
  @ApiQuery(LEDGER_TYPES_QUERY)
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  async exportLedger(
    @Query(new ZodValidationPipe(ExportLedgerDto.schema)) query: ExportLedgerDto,
    @Req() request: DashboardRequest,
    @Res() response: RawResponse,
  ): Promise<void> {
    const entries = await this.balance.statementAll(this.tenantIdOf(request), {
      types: query.type,
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

  // ADM-17, D8-15: a screenshot for the "I have paid" that follows; optional, and only ever seen by Lytro.
  @Post('top-up/evidence')
  @Dashboard({ suspendedOwner: true })
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('EvidenceUploadReady')
  @ApiOperation({ summary: 'Get a signed link to upload a screenshot of a top-up payment' })
  @ZodResponse({ type: EvidenceUploadResponseDto })
  startEvidenceUpload(
    @Body(new ZodValidationPipe(EvidenceUploadDto.schema)) body: EvidenceUploadDto,
    @Req() request: DashboardRequest,
  ): Promise<EvidenceUpload> {
    return this.evidence.startShopUpload(this.tenantIdOf(request), body);
  }

  @Post('top-up/confirm')
  @Dashboard({ suspendedOwner: true })
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('TopUpConfirmed')
  @ApiOperation({ summary: 'Submit a wallet payment for a top-up' })
  @ApiBody({ type: ConfirmTopUpDto })
  @ZodResponse({ type: PlanPaymentDto })
  async confirmTopUp(
    @Body(new ZodValidationPipe(ConfirmTopUpDto.schema)) body: ConfirmTopUpDto,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    const tenantId = this.tenantIdOf(request);
    return this.evidence.withKept(
      { tenantId, uploader: 'seller' },
      body.evidenceKey,
      async (evidenceId) =>
        this.lytroReceipts.afterSubmit(
          await this.topUp.submit(body.paymentId, tenantId, {
            transactionId: body.transactionId,
            senderNumber: body.senderNumber,
            amountPaid: body.amountPaid.toFixed(2),
            evidenceId,
          }),
        ),
    );
  }

  // PAYMENT-PAGE-DESIGN §8: a top-up is paid on the payment page.
  @Post('top-up/:id/page')
  @Dashboard({ suspendedOwner: true })
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('PlanPaymentPageOpened')
  @ApiOperation({ summary: 'Open the payment page for a top-up nothing was sent for' })
  @ZodResponse({ type: PlanPaymentPageDto })
  openPage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(OpenPlanPaymentPageDto.schema)) body: OpenPlanPaymentPageDto,
    @Req() request: DashboardRequest,
  ): Promise<{ url: string }> {
    return this.pages.open(
      this.tenantIdOf(request),
      id,
      body.from,
      [PlanPaymentKind.TopUp],
      new Date(),
    );
  }

  // ADM-17, D8-15 (Slice 8.8): a screenshot for a top-up already sent, while Lytro checks it. The upload's link comes from
  // `POST /balance/top-up/evidence`.
  @Post('top-up/:id/evidence')
  @Dashboard({ suspendedOwner: true })
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('EvidenceSent')
  @ApiOperation({ summary: 'Send a screenshot for a top-up Lytro is still checking (ADM-17)' })
  @ZodResponse({ type: PaymentEvidenceSentDto })
  attachEvidence(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PaymentEvidenceAttachDto.schema)) body: PaymentEvidenceAttachDto,
    @Req() request: DashboardRequest,
  ): Promise<{ evidenceSentAt: Date }> {
    return this.screenshots.attach(
      this.tenantIdOf(request),
      id,
      [PlanPaymentKind.TopUp],
      body.evidenceKey,
    );
  }

  // BIL-19 (decided 2026-10-23): the shop closes a top-up request it has sent nothing for.
  @Post('top-up/:id/cancel')
  @Dashboard({ suspendedOwner: true })
  @RequirePermission(Permission.BalanceManage)
  @ResponseMessage('PaymentCancelled')
  @ApiOperation({ summary: 'Cancel a top-up request nothing was sent for (BIL-19)' })
  @ZodResponse({ type: PlanPaymentDto })
  cancelTopUp(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<PlanPaymentRecord> {
    return this.cancellation.cancel(
      this.tenantIdOf(request),
      id,
      [PlanPaymentKind.TopUp],
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
