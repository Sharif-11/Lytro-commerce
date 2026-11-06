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
  connectCourierSchema,
  type CourierKey,
  type CourierReasonInput,
  type RetireCourierInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import type { PlanOperator } from '../../billing/services/plans.service';
import {
  CourierRetiring,
  type CourierBlockingView,
  type OperatorCourierView,
} from '../../couriers/services/courier-retiring';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  CourierBlockingDto,
  CourierReasonDto,
  CourierRemovedDto,
  CourierRetiredDto,
  CourierRetireUndoneDto,
  OperatorCourierListDto,
  RetireCourierDto,
} from '../dto/couriers.dto';

function courierKeyOf(key: string): CourierKey {
  const known = connectCourierSchema.shape.courierKey.safeParse(key);
  if (!known.success) throw new ApiError('not_found', 'CourierNotAvailable', {});
  return known.data;
}

// CRR-23 to CRR-25 (Phase 6 Slice 6.6, read agreed 2026-11-06): the operator retiring a courier, bringing it back, seeing what holds its
// removal back, and removing it. Each change goes to the platform audit log with the operator's reason, which shops never see.
@ApiTags('Operator Couriers')
@Controller('operator/couriers')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorCourierRetiringController {
  constructor(
    @Inject(CourierRetiring) private readonly retiring: CourierRetiring,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('CouriersListed')
  @ApiOperation({
    summary:
      'Every courier, its state, and how many shops are connected, lean on it by default, and have parcels with it (CRR-23)',
  })
  @ZodResponse({ type: OperatorCourierListDto })
  async list(): Promise<{ couriers: OperatorCourierView[] }> {
    return { couriers: await this.retiring.couriers() };
  }

  @Post(':key/retire')
  @HttpCode(200)
  @ResponseMessage('CourierRetired')
  @ApiOperation({
    summary:
      'Retires a courier: no new shop connects it, every shop connected is told with the suggested courier, and a default on it moves (CRR-23, CRR-25)',
  })
  @ApiBody({ type: RetireCourierDto })
  @ZodResponse({ type: CourierRetiredDto })
  retire(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(RetireCourierDto.schema)) body: RetireCourierInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ courier: OperatorCourierView; told: number; defaultsMoved: number }> {
    return this.retiring.retire(courierKeyOf(key), body, this.operatorOf(request));
  }

  @Post(':key/undo-retire')
  @HttpCode(200)
  @ResponseMessage('CourierRetireUndone')
  @ApiOperation({
    summary:
      'Brings a retiring courier back; shops connected are told, and defaults that moved stay (Slice 6.6)',
  })
  @ApiBody({ type: CourierReasonDto })
  @ZodResponse({ type: CourierRetireUndoneDto })
  undo(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(CourierReasonDto.schema)) body: CourierReasonInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ courier: OperatorCourierView; told: number }> {
    return this.retiring.undo(courierKeyOf(key), body, this.operatorOf(request));
  }

  @Get(':key/blocking')
  @ResponseMessage('CourierBlockingListed')
  @ApiOperation({
    summary:
      'The orders still holding a courier back from removal: a booking not settled, a parcel on its way, or one awaiting its payout (CRR-24)',
  })
  @ZodResponse({ type: CourierBlockingDto })
  blocking(@Param('key') key: string): Promise<CourierBlockingView> {
    return this.retiring.blocking(courierKeyOf(key));
  }

  @Post(':key/remove')
  @HttpCode(200)
  @ResponseMessage('CourierRemoved')
  @ApiOperation({
    summary:
      "Removes a retiring courier once nothing holds it back: every shop's keys and message address for it go, its parcels stay (CRR-24)",
  })
  @ApiBody({ type: CourierReasonDto })
  @ZodResponse({ type: CourierRemovedDto })
  remove(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(CourierReasonDto.schema)) body: CourierReasonInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ courier: OperatorCourierView; disconnected: number }> {
    return this.retiring.remove(courierKeyOf(key), body, this.operatorOf(request));
  }

  /** ADM-08: who changed it, for the platform audit log. */
  private operatorOf(request: OperatorSessionRequest): PlanOperator {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return { operatorId: session.operatorId, ip: this.clientIp.resolve(request) };
  }
}
