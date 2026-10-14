import {
  Body,
  Controller,
  Delete,
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
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { PlanLimitOverridesService } from '../../billing/services/plan-limit-overrides.service';
import type { PlanLimitOverrideRecord } from '../../billing/types/plan-assignment';
import { SetPlanLimitOverrideDto } from '../dto/billing.dto';
import { PlanLimitOverrideDto, PlanLimitOverrideListDto } from '../dto/billing-response.dto';

// PLN-11: per-tenant limit overrides, each with a required reason.
@ApiTags('Operator Plan Limit Overrides')
@Controller('operator/tenants/:tenantId/limit-overrides')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlanLimitOverridesController {
  constructor(
    @Inject(PlanLimitOverridesService) private readonly overrides: PlanLimitOverridesService,
  ) {}

  @Get()
  @ResponseMessage('LimitOverridesListed')
  @ApiOperation({ summary: "List a tenant's plan-limit overrides" })
  @ZodResponse({ type: PlanLimitOverrideListDto })
  list(@Param('tenantId') tenantId: string): Promise<PlanLimitOverrideRecord[]> {
    return this.overrides.listForTenant(tenantId);
  }

  @Post()
  @HttpCode(200)
  @ResponseMessage('LimitOverrideSet')
  @ApiOperation({ summary: "Set a tenant's plan-limit override" })
  @ApiBody({ type: SetPlanLimitOverrideDto })
  @ZodResponse({ type: PlanLimitOverrideDto })
  set(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(SetPlanLimitOverrideDto.schema)) body: SetPlanLimitOverrideDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanLimitOverrideRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.overrides.set(tenantId, body.limitKey, body.value, body.reason, session.operatorId);
  }

  @Delete(':limitKey')
  @HttpCode(200)
  @ResponseMessage('LimitOverrideRemoved')
  @ApiOperation({ summary: "Remove a tenant's plan-limit override" })
  @ZodResponse({ type: OkDto })
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('limitKey') limitKey: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    await this.overrides.remove(tenantId, limitKey, session.operatorId);
    return { ok: true };
  }
}
