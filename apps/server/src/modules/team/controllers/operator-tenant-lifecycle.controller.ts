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
import { FieldProblemCode, phoneSearchOf, TenantSort } from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
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
import { OperatorShopAddonsDto, OperatorShopDto } from '../dto/operator-console.dto';
import { OperatorShops } from '../services/operator-shops';
import type { OperatorShop, OperatorShopAddons } from '../types/operator-shop';

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
    @Inject(OperatorShops) private readonly shops: OperatorShops,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('TenantsListed')
  @ApiOperation({
    summary:
      "The shop list: by shop name, address or the owner's phone, by state and plan, in three orders",
  })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, type: String })
  @ApiQuery({ name: 'planId', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: TenantSort })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ZodResponse({ type: TenantSummaryPageDto })
  async list(@Query(new ZodValidationPipe(SearchTenantsDto.schema)) query: SearchTenantsDto) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor, query.sort) : null;
    const text = query.query ?? null;
    const page = await this.tenants.search(
      {
        query: text,
        phone: text === null ? null : phoneSearchOf(text),
        state: query.state ?? null,
        planId: query.planId ?? null,
      },
      query.sort,
      cursor,
      query.limit,
    );
    return {
      entries: page.entries,
      nextCursor: page.nextCursor ? this.encodeCursor(page.nextCursor) : null,
    };
  }

  @Get(':id')
  @ResponseMessage('OperatorShopRetrieved')
  @ApiOperation({
    summary:
      "A shop's page in the console: its plan's version, why and by whom it is suspended, its payment page and new-shop cap",
  })
  @ZodResponse({ type: OperatorShopDto })
  find(@Param('id') id: string): Promise<OperatorShop> {
    return this.shops.find(id);
  }

  @Get(':id/addons')
  @ResponseMessage('OperatorShopAddonsRetrieved')
  @ApiOperation({
    summary:
      "A shop's running add-ons and packs, and each limit as its plan, override and add-ons make it",
  })
  @ZodResponse({ type: OperatorShopAddonsDto })
  addons(@Param('id') id: string): Promise<OperatorShopAddons> {
    return this.shops.addonsOf(id);
  }

  /** A page link holds its sort, the last shop's key in that sort, and its id. */
  private encodeCursor(cursor: TenantSearchCursor): string {
    const key =
      cursor.sort === TenantSort.Name
        ? cursor.name
        : cursor.sort === TenantSort.PeriodEnd
          ? (cursor.periodEnd?.toISOString() ?? null)
          : cursor.createdAt.toISOString();
    return Buffer.from(JSON.stringify({ s: cursor.sort, k: key, i: cursor.id })).toString(
      'base64url',
    );
  }

  /** A link made for another sort than the one asked is refused, as a malformed one is. */
  private decodeCursor(raw: string, sort: TenantSort): TenantSearchCursor {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        's' in parsed &&
        'k' in parsed &&
        'i' in parsed &&
        parsed.s === sort &&
        typeof parsed.i === 'string'
      ) {
        const { k: key, i: id } = parsed;
        if (sort === TenantSort.Name && typeof key === 'string') return { sort, name: key, id };
        if (sort === TenantSort.PeriodEnd && (key === null || this.isDate(key))) {
          return { sort, periodEnd: key === null ? null : new Date(key), id };
        }
        if (sort === TenantSort.Newest && this.isDate(key)) {
          return { sort, createdAt: new Date(key), id };
        }
      }
    } catch {
      // Falls through to the same refusal as a structurally wrong cursor.
    }
    // Same key the activity log's own cursor decode uses (ActivityListService.decodeCursor) -- one concept,
    // not two.
    throw new FieldsError([
      { field: 'cursor', problem: FieldProblemCode.InvalidFormat, messageKey: 'PageLinkInvalid' },
    ]);
  }

  private isDate(value: unknown): value is string {
    return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
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
    await this.lifecycle.suspend(
      tenantId,
      body.reason,
      session.operatorId,
      this.clientIp.resolve(request),
    );
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
    await this.lifecycle.restore(tenantId, session.operatorId, this.clientIp.resolve(request));
    return { ok: true };
  }
}
