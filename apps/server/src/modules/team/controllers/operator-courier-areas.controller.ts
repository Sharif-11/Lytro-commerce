import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  catalogueIdSchema,
  type AssignCourierAreaInput,
  type ConfirmCourierAreasInput,
  type CourierAreasQuery,
  type RefreshCourierAreasInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import type { PlanOperator } from '../../billing/services/plans.service';
import {
  CourierAreaList,
  type CourierAreaRefresh,
  type CourierAreaView,
} from '../../couriers/services/courier-area-list';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  AssignCourierAreaDto,
  ConfirmCourierAreasDto,
  CourierAreaDto,
  CourierAreaPageDto,
  CourierAreasConfirmedDto,
  CourierAreasQueryDto,
  CourierAreasRefreshedDto,
  RefreshCourierAreasDto,
} from '../dto/couriers.dto';

// CUS-10 (Phase 6 Slice 6.4, read agreed 2026-11-06): a courier's area list, for the operator: what is unassigned or suggested, placing an
// area in a thana, confirming suggestions many at a time, and reading the list again now. Its screens wait for Slice 6.7.
@ApiTags('Operator Couriers')
@Controller('operator/courier-areas')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorCourierAreasController {
  constructor(
    @Inject(CourierAreaList) private readonly areas: CourierAreaList,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('CourierAreasListed')
  @ApiOperation({
    summary:
      "A courier's areas, by how they stand (unassigned, suggested, assigned, retired), a zilla or a name (CUS-10)",
  })
  @ZodResponse({ type: CourierAreaPageDto })
  list(
    @Query(new ZodValidationPipe(CourierAreasQueryDto.schema)) query: CourierAreasQuery,
  ): ReturnType<CourierAreaList['list']> {
    return this.areas.list(query);
  }

  @Put(':id')
  @ResponseMessage('CourierAreaAssigned')
  @ApiOperation({
    summary:
      'Places an area in a thana, where it then counts, or takes it off one with null (CUS-10)',
  })
  @ApiBody({ type: AssignCourierAreaDto })
  @ZodResponse({ type: CourierAreaDto })
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignCourierAreaDto.schema)) body: AssignCourierAreaInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<CourierAreaView> {
    const parsed = catalogueIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'CourierAreaNotFound', {});
    return this.areas.assign(parsed.data, body, this.operatorOf(request));
  }

  @Post('confirm')
  @HttpCode(200)
  @ResponseMessage('CourierAreasConfirmed')
  @ApiOperation({
    summary:
      'Confirms suggested areas in the thanas suggested for them, many at a time (read agreed 2026-11-06)',
  })
  @ApiBody({ type: ConfirmCourierAreasDto })
  @ZodResponse({ type: CourierAreasConfirmedDto })
  confirm(
    @Body(new ZodValidationPipe(ConfirmCourierAreasDto.schema)) body: ConfirmCourierAreasInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ confirmed: number }> {
    return this.areas.confirm(body, this.operatorOf(request));
  }

  @Post('refresh')
  @HttpCode(200)
  @ResponseMessage('CourierAreasRefreshed')
  @ApiOperation({
    summary:
      "Reads a courier's area list again now, with Lytro's own token; it also runs once a week (read agreed 2026-11-06)",
  })
  @ApiBody({ type: RefreshCourierAreasDto })
  @ZodResponse({ type: CourierAreasRefreshedDto })
  refresh(
    @Body(new ZodValidationPipe(RefreshCourierAreasDto.schema)) body: RefreshCourierAreasInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<CourierAreaRefresh> {
    return this.areas.refresh(body.courierKey, this.operatorOf(request));
  }

  /** ADM-08: who changed the list, for the platform audit log. */
  private operatorOf(request: OperatorSessionRequest): PlanOperator {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return { operatorId: session.operatorId, ip: this.clientIp.resolve(request) };
  }
}
