import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  salesQuerySchema,
  shopErrorsQuerySchema,
  shopFailedSmsQuerySchema,
  type SalesQuery,
  type ShopErrorsQuery,
  type ShopFailedSmsQuery,
} from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import type { QueuedPayment } from '../../billing/types/addon';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import type { SalesView } from '../../orders/types/sales';
import { QueuedPaymentListDto } from '../dto/billing-response.dto';
import {
  OperatorShopFiguresDto,
  ShopErrorPageDto,
  ShopFailedSmsDto,
} from '../dto/operator-shop-reads.dto';
import { SalesViewDto } from '../dto/sales.dto';
import { OperatorShopReads } from '../services/operator-shop-reads';
import type { OperatorShopFigures } from '../types/operator-shop';

// ADM-03 (Phase 8 Slice 8.2): the operator's shop page beyond its header -- the figures it opens with, then each list
// behind them when its card is opened. Read-only.
@ApiTags('Operator Tenants')
@Controller('operator/tenants')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorShopReadsController {
  constructor(@Inject(OperatorShopReads) private readonly reads: OperatorShopReads) {}

  @Get(':id/figures')
  @ResponseMessage('OperatorShopFiguresRetrieved')
  @ApiOperation({
    summary:
      "A shop's figures: balance, server errors in 24 hours, failed courier calls, last sign-ins, payments waiting and orders by status (ADM-03)",
  })
  @ZodResponse({ type: OperatorShopFiguresDto })
  figures(@Param('id') id: string): Promise<OperatorShopFigures> {
    return this.reads.figures(id, new Date());
  }

  @Get(':id/errors')
  @ResponseMessage('OperatorShopErrorsListed')
  @ApiOperation({
    summary:
      'The server faults kept for a shop, newest first: kind, route, status and request ID, never a message (ADM-03, D8-23)',
  })
  @ZodResponse({ type: ShopErrorPageDto })
  async errors(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(shopErrorsQuerySchema)) query: ShopErrorsQuery,
  ) {
    const rows = await this.reads.errorList(id, query.before ?? null, query.limit + 1, new Date());
    const errors = rows.slice(0, query.limit);
    const last = errors[errors.length - 1];
    return { errors, nextBefore: rows.length > query.limit && last ? last.id : null };
  }

  @Get(':id/failed-sms')
  @ResponseMessage('OperatorShopFailedSmsListed')
  @ApiOperation({
    summary:
      "A shop's SMS that didn't go, newest first: its own, failed or blocked, without the customer's phone or the words; and Lytro's own to it or its team (ADM-03, D8-30)",
  })
  @ZodResponse({ type: ShopFailedSmsDto })
  failedSms(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(shopFailedSmsQuerySchema)) query: ShopFailedSmsQuery,
  ) {
    return this.reads.failedSms(id, {
      shopBefore: query.shopBefore ?? null,
      lytroBefore: query.lytroBefore ?? null,
      limit: query.limit,
    });
  }

  @Get(':id/payments-waiting')
  @ResponseMessage('OperatorShopPaymentsWaitingListed')
  @ApiOperation({
    summary:
      "A shop's payments to Lytro waiting for the operator, as the queue lists them (ADM-03)",
  })
  @ZodResponse({ type: QueuedPaymentListDto })
  paymentsWaiting(@Param('id') id: string): Promise<QueuedPayment[]> {
    return this.reads.paymentsWaiting(id);
  }

  @Get(':id/sales')
  @ResponseMessage('OperatorShopSalesRetrieved')
  @ApiOperation({
    summary:
      "A shop's own sales figures, as the seller sees them, without cost or profit (ADM-03, STA-01)",
  })
  @ZodResponse({ type: SalesViewDto })
  sales(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(salesQuerySchema)) query: SalesQuery,
  ): Promise<SalesView> {
    return this.reads.salesOf(id, query, new Date());
  }
}
