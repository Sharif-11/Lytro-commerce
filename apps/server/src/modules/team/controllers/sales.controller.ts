import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  Permission,
  bestSellersQuerySchema,
  salesQuerySchema,
  type BestSellersQuery,
  type SalesQuery,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { SalesFigures } from '../../orders/services/sales-figures';
import type { BestSellersView, SalesView } from '../../orders/types/sales';
import { BestSellersViewDto, SalesViewDto } from '../dto/sales.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// STA-01 to STA-04, INV-18 (Phase 4 Slice 4.7, agreed 2026-10-30): the shop's sales figures. Reading them needs
// orders:read; the profit in them, which is cost, inventory:manage (D3-9).
@ApiTags('Sales')
@Controller('sales')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class SalesController {
  constructor(
    @Inject(SalesFigures) private readonly figures: SalesFigures,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.OrdersRead)
  @ResponseMessage('SalesRetrieved')
  @ApiOperation({
    summary:
      "Orders, units, revenue and tax by week, month, quarter or year; a product's trend; profit with inventory:manage (STA-01, STA-03)",
  })
  @ZodResponse({ type: SalesViewDto })
  async sales(
    @Query(new ZodValidationPipe(salesQuerySchema)) query: SalesQuery,
    @Req() request: DashboardRequest,
  ): Promise<SalesView> {
    return this.figures.sales(
      this.request.tenantIdOf(request),
      query,
      await this.request.holds(request, Permission.InventoryManage),
    );
  }

  @Get('best-sellers')
  @RequirePermission(Permission.OrdersRead)
  @ResponseMessage('BestSellersRetrieved')
  @ApiOperation({
    summary: 'The products that sold most in a period, by units or revenue (STA-02)',
  })
  @ZodResponse({ type: BestSellersViewDto })
  bestSellers(
    @Query(new ZodValidationPipe(bestSellersQuerySchema)) query: BestSellersQuery,
    @Req() request: DashboardRequest,
  ): Promise<BestSellersView> {
    return this.figures.bestSellers(this.request.tenantIdOf(request), query);
  }
}
