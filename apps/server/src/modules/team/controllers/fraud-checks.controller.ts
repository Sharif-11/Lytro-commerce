import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  Permission,
  type FraudCheckQuery,
  type RunFraudCheckInput,
  type UpdateFraudRuleInput,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { headerValue } from '../../../common/http';
import { resolveLanguage } from '../../../common/i18n/accept-language';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  FraudChecks,
  type FraudCheckView,
  type FraudRuleView,
  type OrderFraudCheckView,
} from '../../fraud-checks/services/fraud-checks';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  FraudCheckDto,
  FraudCheckQueryDto,
  FraudRuleDto,
  LatestFraudCheckDto,
  OrderFraudCheckDto,
  RunFraudCheckDto,
  UpdateFraudRuleDto,
} from '../dto/fraud-checks.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// FRD-01 to FRD-08 (Phase 7 Slice 7.5, read agreed 2026-11-07): checking a phone and the automatic check. Running a check
// and reading one is `fraud:read`, FRD-01's `fraud:check` (D7-51); changing the automatic check is `fraud:manage`.
@ApiTags('Fraud checks')
@Controller('fraud-checks')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class FraudChecksController {
  constructor(
    @Inject(FraudChecks) private readonly checks: FraudChecks,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.FraudRead)
  @ResponseMessage('FraudCheckRun')
  @ApiOperation({
    summary:
      "Check a phone: Steadfast's record of it through the shop's own key, reused for three days, and the shop's own finished orders with it; figures only, never blocking (FRD-01 to FRD-04, FRD-11)",
  })
  @ApiBody({ type: RunFraudCheckDto })
  @ZodResponse({ type: FraudCheckDto })
  run(
    @Body(new ZodValidationPipe(RunFraudCheckDto.schema)) body: RunFraudCheckInput,
    @Req() request: DashboardRequest,
  ): Promise<FraudCheckView> {
    return this.checks.run(
      {
        tenantId: this.request.tenantIdOf(request),
        userId: this.request.actorOf(request).userId,
      },
      body.phone,
    );
  }

  @Get()
  @RequirePermission(Permission.FraudRead)
  @ResponseMessage('FraudCheckRead')
  @ApiOperation({
    summary: "A phone's latest check, by staff or on an order, asking no one (FRD-01)",
  })
  @ZodResponse({ type: LatestFraudCheckDto })
  async latest(
    @Query(new ZodValidationPipe(FraudCheckQueryDto.schema)) query: FraudCheckQuery,
    @Req() request: DashboardRequest,
  ): Promise<{ latest: FraudCheckView | null }> {
    return { latest: await this.checks.latest(this.request.tenantIdOf(request), query.phone) };
  }

  @Get('orders/:orderId')
  @RequirePermission(Permission.OrdersRead)
  @ResponseMessage('FraudCheckRead')
  @ApiOperation({
    summary:
      "A new order's automatic check as its page shows it: done with its figures, being checked, skipped and why, or not one the rule covers; for anyone who sees the order (FRD-05, Slice 7.7)",
  })
  @ZodResponse({ type: OrderFraudCheckDto })
  orderCheck(
    @Param('orderId') orderId: string,
    @Req() request: DashboardRequest,
  ): Promise<OrderFraudCheckView> {
    return this.checks.orderCheck(
      this.request.tenantIdOf(request),
      this.request.idOf(orderId, 'OrderNotFound'),
      resolveLanguage(headerValue(request.headers['accept-language'])),
    );
  }

  @Get('rule')
  @RequirePermission(Permission.FraudRead)
  @ResponseMessage('FraudRuleRead')
  @ApiOperation({
    summary:
      'Whether every new cash-on-delivery order is checked, and from what amount; on for all of them until changed (FRD-05)',
  })
  @ZodResponse({ type: FraudRuleDto })
  rule(@Req() request: DashboardRequest): Promise<FraudRuleView> {
    return this.checks.rule(this.request.tenantIdOf(request));
  }

  @Put('rule')
  @RequirePermission(Permission.FraudManage)
  @ResponseMessage('FraudRuleSaved')
  @ApiOperation({
    summary: 'Turn the automatic check on or off, and set its smallest amount (FRD-05)',
  })
  @ApiBody({ type: UpdateFraudRuleDto })
  @ZodResponse({ type: FraudRuleDto })
  saveRule(
    @Body(new ZodValidationPipe(UpdateFraudRuleDto.schema)) body: UpdateFraudRuleInput,
    @Req() request: DashboardRequest,
  ): Promise<FraudRuleView> {
    return this.checks.saveRule(this.request.tenantIdOf(request), body);
  }
}
