import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission, stockHistoryQuerySchema, type StockHistoryQuery } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { StockService } from '../../inventory/services/stock.service';
import type { ProductStockView, StockHistoryPage } from '../../inventory/types/inventory';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  AddStockDto,
  ProductStockViewDto,
  SetStockDto,
  StockHistoryPageDto,
  VariantCostDto,
} from '../dto/inventory.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// INV-01 to INV-11, INV-20: a product's stock. Viewing needs inventory:read; changing it, and seeing cost, needs
// inventory:manage (D3-9). Opening stock and the made-to-order switch ride the product's own routes.
@ApiTags('Inventory')
@Controller('products/:id')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class InventoryController {
  constructor(
    @Inject(StockService) private readonly stock: StockService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get('stock')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('StockRetrieved')
  @ApiOperation({
    summary: "A product's stock per variant, and its public stock state (INV-01, CCH-08)",
  })
  @ZodResponse({ type: ProductStockViewDto })
  async view(@Param('id') id: string, @Req() request: DashboardRequest): Promise<ProductStockView> {
    return this.stock.view(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }

  @Put('variants/:variantId/stock')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('StockSaved')
  @ApiOperation({
    summary: 'Set the stock a variant now has; the difference is recorded with its reason (INV-06)',
  })
  @ApiBody({ type: SetStockDto })
  @ZodResponse({ type: ProductStockViewDto })
  setStock(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(SetStockDto.schema)) body: SetStockDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductStockView> {
    return this.stock.setStock(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(variantId, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Post('variants/:variantId/stock-additions')
  @HttpCode(200)
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('StockAdded')
  @ApiOperation({
    summary:
      'Add stock that arrived: packs of a size sharing one stock, the shared stock in its unit, or units (INV-06, INV-24)',
  })
  @ApiBody({ type: AddStockDto })
  @ZodResponse({ type: ProductStockViewDto })
  addStock(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(AddStockDto.schema)) body: AddStockDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductStockView> {
    return this.stock.addStock(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(variantId, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put('variants/:variantId/cost')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('VariantCostSaved')
  @ApiOperation({
    summary: "Type a variant's average cost, before any purchase receipt sets it (INV-10)",
  })
  @ApiBody({ type: VariantCostDto })
  @ZodResponse({ type: ProductStockViewDto })
  setCost(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(VariantCostDto.schema)) body: VariantCostDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductStockView> {
    return this.stock.setCost(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(variantId, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Get('variants/:variantId/stock-history')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('StockHistoryRetrieved')
  @ApiOperation({ summary: "A variant's stock movements, newest first (INV-09)" })
  @ZodResponse({ type: StockHistoryPageDto })
  async history(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Query(new ZodValidationPipe(stockHistoryQuerySchema)) query: StockHistoryQuery,
    @Req() request: DashboardRequest,
  ): Promise<StockHistoryPage> {
    return this.stock.history(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(variantId, 'ProductNotFound'),
      query,
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }
}
