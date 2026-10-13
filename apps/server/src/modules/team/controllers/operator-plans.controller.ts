import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
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
import { PlanAssignmentService } from '../../billing/services/plan-assignment.service';
import { PlansService } from '../../billing/services/plans.service';
import type { PlanAssignmentRecord } from '../../billing/types/plan-assignment';
import type { PlanRecord, PlanVersionRecord } from '../../billing/types/plan';
import { AssignPlanDto, CreatePlanDto, UpdatePlanDto } from '../dto/billing.dto';

function operatorIdOf(request: OperatorSessionRequest): string {
  const session = request.operatorSession;
  if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
  return session.operatorId;
}

// PLN-01 to PLN-12, PLN-16 to PLN-18: the operator's plan editor. Includes not-for-sale plans (PLN-10).
@Controller('operator/plans')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlansController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(PlanAssignmentService) private readonly assignments: PlanAssignmentService,
  ) {}

  @Get()
  list(): Promise<PlanRecord[]> {
    return this.plans.listAll();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePlanDto.schema)) body: CreatePlanDto,
  ): Promise<PlanRecord> {
    return this.plans.create({
      name: body.name,
      description: body.description ?? null,
      rank: body.rank,
      forSale: body.forSale,
      limits: body.limits,
      features: body.features,
    });
  }

  @Get(':id/versions')
  versions(@Param('id') id: string): Promise<PlanVersionRecord[]> {
    return this.plans.listVersions(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlanDto.schema)) body: UpdatePlanDto,
  ): Promise<PlanRecord> {
    return this.plans.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(@Param('id') id: string): Promise<{ ok: true }> {
    await this.plans.delete(id);
    return { ok: true };
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(
    @Param('id') planId: string,
    @Body(new ZodValidationPipe(AssignPlanDto.schema)) body: AssignPlanDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanAssignmentRecord> {
    return this.assignments.assign({
      tenantId: body.tenantId,
      planId,
      expiry: body.expiry ?? null,
      reason: body.reason,
      operatorId: operatorIdOf(request),
    });
  }
}
