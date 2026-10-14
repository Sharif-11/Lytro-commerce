import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
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
import { LifecycleService } from '../../billing/services/lifecycle.service';
import { SuspendTenantDto } from '../dto/balance.dto';

// LIF-24: an operator suspending a tenant for cause, or restoring one -- independent of the tenant's own
// lifecycle `state`, the same split DashboardGuard/TenantResolver already check (`suspendedAt` directly).
@ApiTags('Operator Tenants')
@Controller('operator/tenants')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorTenantLifecycleController {
  constructor(@Inject(LifecycleService) private readonly lifecycle: LifecycleService) {}

  @Post(':id/suspend')
  @HttpCode(200)
  @ResponseMessage('TenantSuspended')
  @ApiOperation({ summary: "Suspend a tenant's shop for cause" })
  @ApiBody({ type: SuspendTenantDto })
  @ZodResponse({ type: OkDto })
  async suspend(
    @Param('id') tenantId: string,
    @Body(new ZodValidationPipe(SuspendTenantDto.schema)) body: SuspendTenantDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    await this.lifecycle.suspend(tenantId, body.reason, session.operatorId);
    return { ok: true };
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ResponseMessage('TenantRestored')
  @ApiOperation({ summary: "Restore a tenant's shop after a suspension" })
  @ZodResponse({ type: OkDto })
  async restore(
    @Param('id') tenantId: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    await this.lifecycle.restore(tenantId, session.operatorId);
    return { ok: true };
  }
}
