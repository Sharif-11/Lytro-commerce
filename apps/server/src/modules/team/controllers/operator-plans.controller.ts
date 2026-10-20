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
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { PlanAssignmentService } from '../../billing/services/plan-assignment.service';
import { PlansService, type PlanOperator } from '../../billing/services/plans.service';
import type { PlanAssignmentRecord } from '../../billing/types/plan-assignment';
import type { PlanRecord, PlanVersionRecord } from '../../billing/types/plan';
import { AssignPlanDto, CreatePlanDto, UpdatePlanDto } from '../dto/billing.dto';
import {
  PlanAssignmentDto,
  PlanDto,
  PlanListDto,
  PlanVersionListDto,
} from '../dto/billing-response.dto';

function operatorIdOf(request: OperatorSessionRequest): string {
  const session = request.operatorSession;
  if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
  return session.operatorId;
}

// PLN-01 to PLN-12, PLN-16 to PLN-18: the operator's plan editor. Includes not-for-sale plans (PLN-10).
@ApiTags('Operator Plans')
@Controller('operator/plans')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlansController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(PlanAssignmentService) private readonly assignments: PlanAssignmentService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('PlansListed')
  @ApiOperation({ summary: 'List every plan, including not-for-sale ones' })
  @ZodResponse({ type: PlanListDto })
  list(): Promise<PlanRecord[]> {
    return this.plans.listAll();
  }

  @Post()
  @ResponseMessage('PlanCreated')
  @ApiOperation({ summary: 'Create a plan' })
  @ApiBody({ type: CreatePlanDto })
  @ZodResponse({ type: PlanDto })
  create(
    @Body(new ZodValidationPipe(CreatePlanDto.schema)) body: CreatePlanDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanRecord> {
    return this.plans.create(
      {
        name: body.name,
        description: body.description ?? null,
        rank: body.rank,
        forSale: body.forSale,
        limits: body.limits,
        features: body.features,
      },
      this.operatorOf(request),
    );
  }

  @Get(':id/versions')
  @ResponseMessage('PlanVersionsRetrieved')
  @ApiOperation({ summary: "List a plan's prior versions" })
  @ZodResponse({ type: PlanVersionListDto })
  versions(@Param('id') id: string): Promise<PlanVersionRecord[]> {
    return this.plans.listVersions(id);
  }

  @Patch(':id')
  @ResponseMessage('PlanUpdated')
  @ApiOperation({ summary: 'Update a plan (snapshots the prior version first)' })
  @ApiBody({ type: UpdatePlanDto })
  @ZodResponse({ type: PlanDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlanDto.schema)) body: UpdatePlanDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlanRecord> {
    return this.plans.update(id, body, this.operatorOf(request));
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('PlanDeleted')
  @ApiOperation({ summary: 'Delete a plan (only if unreferenced)' })
  @ZodResponse({ type: OkDto })
  async delete(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.plans.delete(id, this.operatorOf(request));
    return { ok: true };
  }

  @Post(':id/assign')
  @HttpCode(200)
  @ResponseMessage('PlanAssigned')
  @ApiOperation({ summary: 'Assign a plan to a tenant' })
  @ApiBody({ type: AssignPlanDto })
  @ZodResponse({ type: PlanAssignmentDto })
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
      ip: this.clientIp.resolve(request),
    });
  }

  /** ADM-08: who changed the plan, for the platform audit log. */
  private operatorOf(request: OperatorSessionRequest): PlanOperator {
    return { operatorId: operatorIdOf(request), ip: this.clientIp.resolve(request) };
  }
}
