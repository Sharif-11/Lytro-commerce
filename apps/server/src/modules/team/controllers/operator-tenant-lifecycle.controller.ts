import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { TenantSearchCursor } from '../../tenancy/ports/tenant-summary-store';
import { SearchTenantsDto, SuspendTenantDto } from '../dto/balance.dto';
import { TenantSummaryPageDto } from '../dto/balance-response.dto';

// LIF-24: an operator suspending a tenant for cause, or restoring one -- independent of the tenant's own
// lifecycle `state`, the same split DashboardGuard/TenantResolver already check (`suspendedAt` directly).
// Also the operator's own tenant search (list()), since there's otherwise no way to find a tenant id to
// suspend/restore without already having it.
@ApiTags('Operator Tenants')
@Controller('operator/tenants')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorTenantLifecycleController {
  constructor(
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
    @Inject(TenantSummaries) private readonly tenants: TenantSummaries,
  ) {}

  @Get()
  @ResponseMessage('TenantsListed')
  @ApiOperation({ summary: 'Search tenants by shop name or slug' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ZodResponse({ type: TenantSummaryPageDto })
  async list(@Query(new ZodValidationPipe(SearchTenantsDto.schema)) query: SearchTenantsDto) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const page = await this.tenants.search(query.query ?? null, cursor, query.limit);
    return {
      entries: page.entries,
      nextCursor: page.nextCursor ? this.encodeCursor(page.nextCursor) : null,
    };
  }

  private encodeCursor(cursor: TenantSearchCursor): string {
    return Buffer.from(
      JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id }),
    ).toString('base64url');
  }

  private decodeCursor(raw: string): TenantSearchCursor {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'c' in parsed &&
        'i' in parsed &&
        typeof parsed.c === 'string' &&
        typeof parsed.i === 'string'
      ) {
        return { createdAt: new Date(parsed.c), id: parsed.i };
      }
    } catch {
      // Falls through to the same refusal as a structurally wrong cursor.
    }
    // Same key the activity log's own cursor decode uses (ActivityListService.decodeCursor) -- one concept,
    // not two.
    throw new ApiError('validation_error', 'PageLinkInvalid', { field: 'cursor' });
  }

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
