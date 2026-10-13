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
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { PlanLimitOverridesService } from '../../billing/services/plan-limit-overrides.service';
import type { PlanLimitOverrideRecord } from '../../billing/types/plan-assignment';
import { SetPlanLimitOverrideDto } from '../dto/billing.dto';

// PLN-11: per-tenant limit overrides, each with a required reason.
@Controller('operator/tenants/:tenantId/limit-overrides')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlanLimitOverridesController {
  constructor(
    @Inject(PlanLimitOverridesService) private readonly overrides: PlanLimitOverridesService,
  ) {}

  @Get()
  list(@Param('tenantId') tenantId: string): Promise<PlanLimitOverrideRecord[]> {
    return this.overrides.listForTenant(tenantId);
  }

  @Post()
  @HttpCode(200)
  set(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(SetPlanLimitOverrideDto.schema)) body: SetPlanLimitOverrideDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanLimitOverrideRecord> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    return this.overrides.set(tenantId, body.limitKey, body.value, body.reason, session.operatorId);
  }

  @Delete(':limitKey')
  @HttpCode(200)
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('limitKey') limitKey: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    await this.overrides.remove(tenantId, limitKey, session.operatorId);
    return { ok: true };
  }
}
