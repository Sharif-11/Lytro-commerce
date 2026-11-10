import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  isAccountMethod,
  type AccountMethod,
  type PaymentMethodTypeReasonInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import type { PlanOperator } from '../../billing/services/plans.service';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  PaymentMethodRetiring,
  type OperatorPaymentMethodTypeView,
} from '../../payment-method-types/services/payment-method-retiring';
import {
  OperatorPaymentMethodTypeListDto,
  PaymentMethodTypeReasonDto,
  PaymentMethodTypeRemovedDto,
  PaymentMethodTypeRetiredDto,
} from '../dto/operator-payment-method-types.dto';

function methodOf(raw: string): AccountMethod {
  if (!isAccountMethod(raw)) throw new ApiError('not_found', 'PaymentMethodNotFound', {});
  return raw;
}

// WAL-18 (Phase 8 Slice 8.7, read agreed 2026-11-10, D8-65 to D8-67): the operator retiring a payment method type, bringing it
// back, and removing it, the couriers' way. Each change goes to the platform audit log with the operator's reason, which shops
// never see. The console's page comes with Slice 8.8.
@ApiTags('Operator Payment Method Types')
@Controller('operator/payment-method-types')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPaymentMethodTypesController {
  constructor(
    @Inject(PaymentMethodRetiring) private readonly retiring: PaymentMethodRetiring,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('PaymentMethodTypesListed')
  @ApiOperation({
    summary:
      "Every payment method type, its state, the shops that have it on or saved an account for it, payments open on it, and whether Lytro's own page takes it (WAL-18)",
  })
  @ZodResponse({ type: OperatorPaymentMethodTypeListDto })
  async list(): Promise<{ types: OperatorPaymentMethodTypeView[] }> {
    return { types: await this.retiring.list() };
  }

  @Post(':method/retire')
  @HttpCode(200)
  @ResponseMessage('PaymentMethodTypeRetired')
  @ApiOperation({
    summary:
      'Retires a payment method type: shops that never set it up no longer see it, and those that did keep it and are told (WAL-18)',
  })
  @ApiBody({ type: PaymentMethodTypeReasonDto })
  @ZodResponse({ type: PaymentMethodTypeRetiredDto })
  retire(
    @Param('method') method: string,
    @Body(new ZodValidationPipe(PaymentMethodTypeReasonDto.schema))
    body: PaymentMethodTypeReasonInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ type: OperatorPaymentMethodTypeView; told: number }> {
    return this.retiring.retire(methodOf(method), body, this.operatorOf(request));
  }

  @Post(':method/undo-retire')
  @HttpCode(200)
  @ResponseMessage('PaymentMethodTypeRetireUndone')
  @ApiOperation({
    summary:
      'Brings a retiring payment method type back; the shops that set it up are told (WAL-18)',
  })
  @ApiBody({ type: PaymentMethodTypeReasonDto })
  @ZodResponse({ type: PaymentMethodTypeRetiredDto })
  undo(
    @Param('method') method: string,
    @Body(new ZodValidationPipe(PaymentMethodTypeReasonDto.schema))
    body: PaymentMethodTypeReasonInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ type: OperatorPaymentMethodTypeView; told: number }> {
    return this.retiring.undo(methodOf(method), body, this.operatorOf(request));
  }

  @Post(':method/remove')
  @HttpCode(200)
  @ResponseMessage('PaymentMethodTypeRemoved')
  @ApiOperation({
    summary:
      "Removes a retiring payment method type once no shop has it on, no payment is open on it and Lytro's own page doesn't take it; every shop's accounts for it go, past payments stay (WAL-18)",
  })
  @ApiBody({ type: PaymentMethodTypeReasonDto })
  @ZodResponse({ type: PaymentMethodTypeRemovedDto })
  remove(
    @Param('method') method: string,
    @Body(new ZodValidationPipe(PaymentMethodTypeReasonDto.schema))
    body: PaymentMethodTypeReasonInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ type: OperatorPaymentMethodTypeView; cleared: number }> {
    return this.retiring.remove(methodOf(method), body, this.operatorOf(request));
  }

  /** ADM-08: who changed it, for the platform audit log. */
  private operatorOf(request: OperatorSessionRequest): PlanOperator {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return { operatorId: session.operatorId, ip: this.clientIp.resolve(request) };
  }
}
