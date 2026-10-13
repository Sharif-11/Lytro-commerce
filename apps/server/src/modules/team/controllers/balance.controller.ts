import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { BalanceService } from '../../balance/services/balance.service';
import { RateService } from '../../balance/services/rate.service';
import type { BalanceSnapshot, LedgerPage } from '../../balance/types/ledger-entry';
import type { RateValue } from '../../balance/types/rate';
import { ListLedgerDto } from '../dto/balance.dto';

// BAL-01, BAL-08, BAL-14, RAT-06: a tenant's own balance, statement and current rates.
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
  current(@Req() request: DashboardRequest): Promise<BalanceSnapshot> {
    return this.balance.current(this.tenantIdOf(request));
  }

  @Get('ledger')
  @RequirePermission(Permission.BalanceRead)
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
  currentRates(): Promise<RateValue[]> {
    return this.rates.list();
  }

  private tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'Create your shop to continue.', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
