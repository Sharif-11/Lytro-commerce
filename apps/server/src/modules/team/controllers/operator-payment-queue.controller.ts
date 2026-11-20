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
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  EVIDENCE_CONTENT_TYPES,
  PlanPaymentKind,
  queuedPaymentAmountSchema,
  type QueuedPaymentAmountInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { PaymentQueueService } from '../../billing/services/payment-queue.service';
import type { QueuedPayment } from '../../billing/types/addon';
import { sendEvidence, type EvidenceResponse } from '../../payment-evidence/evidence-response';
import { PaymentEvidence } from '../../payment-evidence/services/payment-evidence';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { ListPaymentQueueDto, RejectPaymentDto } from '../dto/billing.dto';
import { PlanPaymentDto, QueuedPaymentListDto } from '../dto/billing-response.dto';

// D2-1/ADM-06: the one operator queue for every pending plan_payments row -- the manual stand-in for Phase 5's
// real hosted-page/gateway verification. Approving activates the plan or credits the balance exactly once.
@ApiTags('Operator Payment Queue')
@Controller('operator/payment-queue')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPaymentQueueController {
  constructor(
    @Inject(PaymentQueueService) private readonly queue: PaymentQueueService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PaymentEvidence) private readonly evidence: PaymentEvidence,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('PaymentQueueListed')
  @ApiOperation({ summary: 'List payments awaiting review' })
  @ApiQuery({ name: 'kind', required: false, enum: PlanPaymentKind })
  @ZodResponse({ type: QueuedPaymentListDto })
  list(
    @Query(new ZodValidationPipe(ListPaymentQueueDto.schema)) query: ListPaymentQueueDto,
  ): Promise<QueuedPayment[]> {
    return this.queue.listPending(query.kind);
  }

  // ADM-17, D8-15: the seller's screenshot of a payment waiting here, the file itself through the server (D8-47 as
  // amended 2026-11-20).
  @Get(':id/evidence')
  @ApiOperation({ summary: "A payment's screenshot, the file itself" })
  @ApiProduces(...EVIDENCE_CONTENT_TYPES)
  async evidenceFile(@Param('id') id: string, @Res() response: EvidenceResponse): Promise<void> {
    const payment = await this.payments.find(id);
    if (payment.evidenceId === null) throw new ApiError('not_found', 'EvidenceNotFound', {});
    sendEvidence(response, await this.evidence.read(payment.evidenceId));
  }

  @Post(':id/approve')
  @ResponseMessage('PaymentApproved')
  @ApiOperation({
    summary: 'Approve a pending payment (activates the plan or credits the balance)',
  })
  @ZodResponse({ type: PlanPaymentDto })
  approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(queuedPaymentAmountSchema)) body: QueuedPaymentAmountInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanPaymentRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.queue.approve(
      id,
      session.operatorId,
      this.clientIp.resolve(request),
      body?.amount?.toFixed(2),
    );
  }

  @Post(':id/credit')
  @ResponseMessage('PaymentCreditedInstead')
  @ApiOperation({
    summary:
      "Put a plan's or add-on's money on the seller's balance instead of activating it: what the operator says arrived, else what a receipt says (BIL-06)",
  })
  @ZodResponse({ type: PlanPaymentDto })
  credit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(queuedPaymentAmountSchema)) body: QueuedPaymentAmountInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanPaymentRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.queue.creditInstead(
      id,
      session.operatorId,
      this.clientIp.resolve(request),
      body?.amount?.toFixed(2),
    );
  }

  @Post(':id/reject')
  @ResponseMessage('PaymentRejected')
  @ApiOperation({ summary: 'Reject a pending payment' })
  @ApiBody({ type: RejectPaymentDto })
  @ZodResponse({ type: PlanPaymentDto })
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectPaymentDto.schema)) body: RejectPaymentDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanPaymentRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.queue.reject(id, session.operatorId, body.note, this.clientIp.resolve(request));
  }
}
