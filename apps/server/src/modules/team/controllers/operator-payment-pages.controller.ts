import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  catalogueIdSchema,
  PaymentPageReportStatus,
  type PaymentPageReportListInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { OkDto } from '../../../common/dto/ok.dto';
import type { MessageKey } from '../../../common/i18n/message-key';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { PaymentPageOversight } from '../../payment-sessions/services/payment-page-oversight';
import type { PaymentPageReportView } from '../../payment-sessions/types/payment-sessions';
import { SuspendTenantDto } from '../dto/balance.dto';
import {
  NewShopCapDto,
  PaymentPageReportListDto,
  PaymentPageReportQueryDto,
} from '../dto/payment-pages.dto';

// ADM-12: the queue shows this many reports unless asked for fewer.
const REPORTS_SHOWN = 50;

// TVR-02, TVR-03, ADM-12 (Phase 5 Slice 5.2b): the operator's queue of shoppers' "Report this page" reports, and a
// shop's payment page suspended or restored -- apart from suspending the whole shop (LIF-24); and (Slice 5.3, TVR-04)
// a shop's new-shop payment cap switched.
@ApiTags('Operator Payment Pages')
@Controller('operator')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPaymentPagesController {
  constructor(
    @Inject(PaymentPageOversight) private readonly oversight: PaymentPageOversight,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get('payment-page-reports')
  @ResponseMessage('PaymentPageReportsListed')
  @ApiOperation({
    summary:
      "Shoppers' reports of payment pages, newest first, each with its shop and the page to open; open ones unless asked (TVR-02, ADM-12)",
  })
  @ZodResponse({ type: PaymentPageReportListDto })
  async list(
    @Query(new ZodValidationPipe(PaymentPageReportQueryDto.schema))
    query: PaymentPageReportListInput,
  ): Promise<{ reports: PaymentPageReportView[] }> {
    return {
      reports: await this.oversight.list(
        query.status ?? PaymentPageReportStatus.Open,
        query.limit ?? REPORTS_SHOWN,
      ),
    };
  }

  @Post('payment-page-reports/:id/dismiss')
  @HttpCode(200)
  @ResponseMessage('PaymentPageReportDismissed')
  @ApiOperation({ summary: 'Dismiss an open report; nothing is done to the shop (ADM-12)' })
  @ZodResponse({ type: OkDto })
  async dismiss(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.oversight.dismiss(
      this.idOf(id, 'PaymentPageReportNotFound'),
      this.operatorOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  @Post('tenants/:id/payment-page/suspend')
  @HttpCode(200)
  @ResponseMessage('PaymentPageSuspended')
  @ApiOperation({
    summary:
      "Suspend a shop's payment page at once, with the reason: new payments refused, open pages unavailable; its open reports are acted on (TVR-03)",
  })
  @ApiBody({ type: SuspendTenantDto })
  @ZodResponse({ type: OkDto })
  async suspend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SuspendTenantDto.schema)) body: SuspendTenantDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.oversight.suspend(
      this.idOf(id, 'ShopNotFound'),
      body.reason,
      this.operatorOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  @Post('tenants/:id/new-shop-cap')
  @HttpCode(200)
  @ResponseMessage('NewShopCapSet')
  @ApiOperation({
    summary:
      "Switch a shop's new-shop payment cap on or off, or (null) back to its kind's default -- on for pay-as-you-go, off on a plan (TVR-04)",
  })
  @ApiBody({ type: NewShopCapDto })
  @ZodResponse({ type: OkDto })
  async setNewShopCap(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(NewShopCapDto.schema)) body: NewShopCapDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.oversight.setNewShopCap(
      this.idOf(id, 'ShopNotFound'),
      body.capped,
      this.operatorOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  @Post('tenants/:id/payment-page/restore')
  @HttpCode(200)
  @ResponseMessage('PaymentPageRestored')
  @ApiOperation({ summary: "Let a shop's payment page take payments again (TVR-03)" })
  @ZodResponse({ type: OkDto })
  async restore(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.oversight.restore(
      this.idOf(id, 'ShopNotFound'),
      this.operatorOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  private operatorOf(request: OperatorSessionRequest): string {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return session.operatorId;
  }

  /** An id that is not one finds nothing, as an unknown one does. */
  private idOf(raw: string, notFound: MessageKey): string {
    const parsed = catalogueIdSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('not_found', notFound, {});
    return parsed.data;
  }
}
