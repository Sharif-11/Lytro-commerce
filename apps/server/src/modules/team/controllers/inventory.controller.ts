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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  Permission,
  serialListQuerySchema,
  stockHistoryQuerySchema,
  type SerialListQuery,
  type StockHistoryQuery,
} from '@lytronix/validators';
import { OkDto } from '../../../common/dto/ok.dto';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { BatchService } from '../../inventory/services/batch.service';
import { SerialService } from '../../inventory/services/serial.service';
import { StockService } from '../../inventory/services/stock.service';
import { ReceivingService } from '../../purchasing/services/receiving.service';
import type {
  ProductBatchesView,
  ProductStockView,
  SerialPage,
  SerialView,
  StockHistoryPage,
} from '../../inventory/types/inventory';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  AddSerialsDto,
  AddStockDto,
  CorrectSerialDto,
  ProductBatchesDto,
  SerialPageDto,
  SerialViewDto,
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
    @Inject(BatchService) private readonly batches: BatchService,
    @Inject(SerialService) private readonly serials: SerialService,
    // PUR-07: stock arriving through these routes is recorded as a purchase received in full.
    @Inject(ReceivingService) private readonly arrivals: ReceivingService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get('variants/:variantId/serials')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('SerialsRetrieved')
  @ApiOperation({ summary: "A variant's serial numbers, the units it holds by default (INV-14)" })
  @ZodResponse({ type: SerialPageDto })
  listSerials(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Query(new ZodValidationPipe(serialListQuerySchema)) query: SerialListQuery,
    @Req() request: DashboardRequest,
  ): Promise<SerialPage> {
    return this.serials.list(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(variantId, 'ProductNotFound'),
      query,
    );
  }

  @Post('variants/:variantId/serials')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('SerialsAdded')
  @ApiOperation({
    summary: 'Add serial numbers to units already held that have none yet (INV-14, INV-23)',
  })
  @ApiBody({ type: AddSerialsDto })
  @ZodResponse({ type: SerialPageDto })
  addSerials(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(AddSerialsDto.schema)) body: AddSerialsDto,
    @Req() request: DashboardRequest,
  ): Promise<SerialPage> {
    return this.serials.add(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(variantId, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Patch('serials/:serialId')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('SerialCorrected')
  @ApiOperation({
    summary: 'Correct a serial number typed wrong, while its unit is in stock (INV-14)',
  })
  @ApiBody({ type: CorrectSerialDto })
  @ZodResponse({ type: SerialViewDto })
  correctSerial(
    @Param('id') id: string,
    @Param('serialId') serialId: string,
    @Body(new ZodValidationPipe(CorrectSerialDto.schema)) body: CorrectSerialDto,
    @Req() request: DashboardRequest,
  ): Promise<SerialView> {
    return this.serials.correct(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(serialId, 'SerialNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete('serials/:serialId')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('SerialRemoved')
  @ApiOperation({
    summary: 'Remove a serial number while its unit is in stock; the unit then has none (INV-14)',
  })
  @ZodResponse({ type: OkDto })
  async removeSerial(
    @Param('id') id: string,
    @Param('serialId') serialId: string,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.serials.remove(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(serialId, 'SerialNotFound'),
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }

  @Get('batches')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('BatchesRetrieved')
  @ApiOperation({
    summary:
      "A product's batches holding stock, in picking order, with their expiry (INV-12, INV-13)",
  })
  @ZodResponse({ type: ProductBatchesDto })
  listBatches(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<ProductBatchesView> {
    return this.batches.productBatches(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
    );
  }

  @Post('batches/:batchId/write-off')
  @HttpCode(200)
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('BatchWrittenOff')
  @ApiOperation({
    summary: 'Write off what an expired batch holds, as an expired movement (INV-13)',
  })
  @ZodResponse({ type: ProductBatchesDto })
  writeOff(
    @Param('id') id: string,
    @Param('batchId') batchId: string,
    @Req() request: DashboardRequest,
  ): Promise<ProductBatchesView> {
    return this.batches.writeOff(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.idOf(batchId, 'BatchNotFound'),
      this.catalogue.actorOf(request),
    );
  }

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
      this.arrivals,
    );
  }

  @Post('variants/:variantId/stock-additions')
  @HttpCode(200)
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('StockAdded')
  @ApiOperation({
    summary:
      'Add stock that arrived, recorded as a purchase received in full: packs of a size sharing one stock, the shared stock in its unit, or units (INV-06, INV-24, PUR-07)',
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
      this.arrivals,
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
