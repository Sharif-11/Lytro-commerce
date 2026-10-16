import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { PlanPaymentKind } from '@lytronix/validators';
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
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { RejectPaymentDto } from '../dto/billing.dto';
import { PlanPaymentDto, PlanPaymentListDto } from '../dto/billing-response.dto';

// D2-1/ADM-06: the one operator queue for every pending plan_payments row -- the manual stand-in for Phase 5's
// real hosted-page/gateway verification. Approving activates the plan or credits the balance exactly once.
@ApiTags('Operator Payment Queue')
@Controller('operator/payment-queue')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPaymentQueueController {
  constructor(
    @Inject(PaymentQueueService) private readonly queue: PaymentQueueService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('PaymentQueueListed')
  @ApiOperation({ summary: 'List payments awaiting review' })
  @ApiQuery({ name: 'kind', required: false, enum: PlanPaymentKind })
  @ZodResponse({ type: PlanPaymentListDto })
  list(@Query('kind') kind?: PlanPaymentKind): Promise<PlanPaymentRecord[]> {
    return this.queue.listPending(kind);
  }

  @Post(':id/approve')
  @ResponseMessage('PaymentApproved')
  @ApiOperation({
    summary: 'Approve a pending payment (activates the plan or credits the balance)',
  })
  @ZodResponse({ type: PlanPaymentDto })
  approve(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanPaymentRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.queue.approve(id, session.operatorId, this.clientIp.resolve(request));
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
