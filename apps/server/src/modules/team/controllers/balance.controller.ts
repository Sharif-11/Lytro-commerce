import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { LedgerEntryType, Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { BalanceService } from '../../balance/services/balance.service';
import { RateService } from '../../balance/services/rate.service';
import type { BalanceSnapshot, LedgerPage } from '../../balance/types/ledger-entry';
import type { RateValue } from '../../balance/types/rate';
import { ListLedgerDto } from '../dto/balance.dto';
import { BalanceSnapshotDto, LedgerPageDto, RateValueDto } from '../dto/balance-response.dto';

// BAL-01, BAL-08, BAL-14, RAT-06: a tenant's own balance, statement and current rates.
@ApiTags('Balance')
@Controller('balance')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class BalanceController {
  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
  ) {}

  @Get()
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('BalanceRetrieved')
  @ApiOperation({ summary: "Get the shop's current balance" })
  @ZodResponse({ type: BalanceSnapshotDto })
  current(@Req() request: DashboardRequest): Promise<BalanceSnapshot> {
    return this.balance.current(this.tenantIdOf(request));
  }

  @Get('ledger')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('LedgerRetrieved')
  @ApiOperation({ summary: "Get the shop's balance statement" })
  @ApiQuery({ name: 'type', required: false, enum: LedgerEntryType })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ZodResponse({ type: LedgerPageDto })
  ledger(
    @Query(new ZodValidationPipe(ListLedgerDto.schema)) query: ListLedgerDto,
    @Req() request: DashboardRequest,
  ): Promise<LedgerPage> {
    return this.balance.statement(
      this.tenantIdOf(request),
      { type: query.type, dateFrom: query.dateFrom, dateTo: query.dateTo },
      query.cursor ?? null,
      query.limit,
    );
  }

  @Get('current-rates')
  @RequirePermission(Permission.BalanceRead)
  @ResponseMessage('RatesRetrieved')
  @ApiOperation({ summary: 'Get the current platform rates' })
  @ZodResponse({ type: [RateValueDto] })
  currentRates(): Promise<RateValue[]> {
    return this.rates.list();
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
