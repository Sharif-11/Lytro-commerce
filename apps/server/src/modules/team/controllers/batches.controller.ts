import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { batchListQuerySchema, Permission, type BatchListQuery } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { BatchService } from '../../inventory/services/batch.service';
import type { ShopBatchPage } from '../../inventory/types/inventory';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { ShopBatchPageDto } from '../dto/inventory.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// INV-13: the shop's batches that are expiring soon or have expired, for the notices screen. Reading them needs
// inventory:read; writing one off is on its product (inventory:manage).
@ApiTags('Inventory')
@Controller('batches')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class BatchesController {
  constructor(
    @Inject(BatchService) private readonly batches: BatchService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('BatchesRetrieved')
  @ApiOperation({
    summary: "The shop's expiring and expired batches holding stock, soonest first (INV-13)",
  })
  @ZodResponse({ type: ShopBatchPageDto })
  async list(
    @Query(new ZodValidationPipe(batchListQuerySchema)) query: BatchListQuery,
    @Req() request: DashboardRequest,
  ): Promise<ShopBatchPage> {
    return this.batches.shopBatches(
      this.catalogue.tenantIdOf(request),
      query,
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }
}
