import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  inventoryFiguresQuerySchema,
  Permission,
  stockCheckListQuerySchema,
  type InventoryFiguresQuery,
  type StockCheckListQuery,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { InventoryFiguresService } from '../../inventory/services/inventory-figures.service';
import { StockCheckService } from '../../inventory/services/stock-check.service';
import type {
  InventoryFigures,
  StockCheckPage,
  StockCheckView,
} from '../../inventory/types/inventory';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  InventoryFiguresDto,
  RecordStockCheckDto,
  StockCheckPageDto,
  StockCheckViewDto,
} from '../dto/inventory.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// INV-07, INV-20: stock checks. Recording one needs inventory:manage; reading them needs inventory:read, and their
// costs and values inventory:manage (D3-9).
@ApiTags('Inventory')
@Controller('stock-checks')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class StockChecksController {
  constructor(
    @Inject(StockCheckService) private readonly checks: StockCheckService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Post()
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('StockCheckSaved')
  @ApiOperation({
    summary: 'Record what was counted; each difference becomes one recount movement (INV-07)',
  })
  @ApiBody({ type: RecordStockCheckDto })
  @ZodResponse({ type: StockCheckViewDto })
  record(
    @Body(new ZodValidationPipe(RecordStockCheckDto.schema)) body: RecordStockCheckDto,
    @Req() request: DashboardRequest,
  ): Promise<StockCheckView> {
    return this.checks.record(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Get()
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('StockChecksRetrieved')
  @ApiOperation({ summary: "The shop's stock checks, newest first (INV-07)" })
  @ZodResponse({ type: StockCheckPageDto })
  async list(
    @Query(new ZodValidationPipe(stockCheckListQuerySchema)) query: StockCheckListQuery,
    @Req() request: DashboardRequest,
  ): Promise<StockCheckPage> {
    return this.checks.list(
      this.catalogue.tenantIdOf(request),
      query,
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }

  @Get(':id')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('StockCheckRetrieved')
  @ApiOperation({
    summary: 'One stock check, line by line, with the value gained or lost (INV-07)',
  })
  @ZodResponse({ type: StockCheckViewDto })
  async get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<StockCheckView> {
    return this.checks.get(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'StockCheckNotFound'),
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }
}

// INV-18, D3-9: the inventory figures are all cost, so they need inventory:manage.
@ApiTags('Inventory')
@Controller('inventory')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class InventoryFiguresController {
  constructor(
    @Inject(InventoryFiguresService) private readonly figures: InventoryFiguresService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get('figures')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('InventoryFiguresRetrieved')
  @ApiOperation({
    summary: 'Stock value, cost of goods sold and losses by reason for a period (INV-18)',
  })
  @ZodResponse({ type: InventoryFiguresDto })
  read(
    @Query(new ZodValidationPipe(inventoryFiguresQuerySchema)) query: InventoryFiguresQuery,
    @Req() request: DashboardRequest,
  ): Promise<InventoryFigures> {
    return this.figures.figures(this.catalogue.tenantIdOf(request), query);
  }
}
