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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission, type PaymentListQuery } from '@lytronix/validators';
import { toCsv } from '../../../common/csv';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import type { OrderView } from '../../orders/types/orders';
import { PaymentReview } from '../../payment-review/services/payment-review';
import { PaymentsList } from '../../payment-review/services/payments-list';
import type { PaymentPage } from '../../payment-review/types/payment-review';
import { OrderViewDto } from '../dto/orders.dto';
import {
  PaymentListQueryDto,
  PaymentPageDto,
  RejectShopperPaymentDto,
  VerifyShopperPaymentDto,
} from '../dto/payments.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// PAY-19: the raw response the CSV route writes to, the narrow shape the balance statement's export uses.
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string): void;
}

// VER-01, PAY-14, PAY-15, PAY-19 (Phase 5 Slice 5.3, read agreed 2026-10-31): the shop's one list of payments and its
// CSV (payments:read), and verifying or rejecting a transaction ID a shopper typed (payments:verify). A payment is
// named by its id in the list: a session's while it waits or was rejected.
@ApiTags('Payments')
@Controller('payments')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class PaymentsController {
  constructor(
    @Inject(PaymentsList) private readonly payments: PaymentsList,
    @Inject(PaymentReview) private readonly review: PaymentReview,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.PaymentsRead)
  @ResponseMessage('PaymentsListed')
  @ApiOperation({
    summary:
      "The shop's payments, newest first: transaction IDs shoppers typed (to verify, rejected) and money in (verified, voided, refunded), by status, method and days, searched by sender, ID or order number, with totals (PAY-19)",
  })
  @ZodResponse({ type: PaymentPageDto })
  list(
    @Query(new ZodValidationPipe(PaymentListQueryDto.schema)) query: PaymentListQuery,
    @Req() request: DashboardRequest,
  ): Promise<PaymentPage> {
    return this.payments.list(this.request.tenantIdOf(request), query);
  }

  @Get('export')
  @RequirePermission(Permission.PaymentsRead)
  @ApiOperation({ summary: "The same payments as CSV, the list's filters applied (PAY-19)" })
  async export(
    @Query(new ZodValidationPipe(PaymentListQueryDto.schema)) query: PaymentListQuery,
    @Req() request: DashboardRequest,
    @Res() response: RawResponse,
  ): Promise<void> {
    const rows = await this.payments.exportAll(this.request.tenantIdOf(request), query);
    const csv = toCsv(
      rows.map((row) => ({
        at: row.at.toISOString(),
        orderNumber: row.order.orderNumber,
        status: row.status,
        method: row.method,
        amount: row.amount,
        senderNumber: row.senderNumber,
        transactionId: row.transactionId,
        source: row.source,
        verificationLevel: row.verificationLevel,
        decidedBy: row.decidedBy?.name ?? null,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        rejectReason: row.rejectReason,
        note: row.note,
      })),
      [
        'at',
        'orderNumber',
        'status',
        'method',
        'amount',
        'senderNumber',
        'transactionId',
        'source',
        'verificationLevel',
        'decidedBy',
        'decidedAt',
        'rejectReason',
        'note',
      ],
    );
    response
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="payments.csv"',
      })
      .send(csv);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @RequirePermission(Permission.PaymentsVerify)
  @ResponseMessage('PaymentVerified')
  @ApiOperation({
    summary:
      "Verify a transaction ID a shopper typed, for the amount that arrived (the amount asked when left out, never more than is due); it becomes the order's payment and the order moves on (VER-01, PAY-15)",
  })
  @ApiBody({ type: VerifyShopperPaymentDto })
  @ZodResponse({ type: OrderViewDto })
  verify(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(VerifyShopperPaymentDto.schema)) body: VerifyShopperPaymentDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.review.verify(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderPaymentNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission(Permission.PaymentsVerify)
  @ResponseMessage('PaymentRejected')
  @ApiOperation({
    summary:
      "Reject a transaction ID a shopper typed, with the reason the page shows them; a checkout's order is cancelled, its stock let go (PAY-14, D5-4)",
  })
  @ApiBody({ type: RejectShopperPaymentDto })
  @ZodResponse({ type: OrderViewDto })
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectShopperPaymentDto.schema)) body: RejectShopperPaymentDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.review.reject(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderPaymentNotFound'),
      body,
      this.request.actorOf(request),
    );
  }
}
