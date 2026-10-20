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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  Permission,
  purchaseOrderListQuerySchema,
  type PurchaseOrderListQuery,
} from '@lytronix/validators';
import { OkDto } from '../../../common/dto/ok.dto';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PurchaseOrderService } from '../../purchasing/services/purchase-order.service';
import type { PurchaseOrderPage, PurchaseOrderView } from '../../purchasing/types/purchasing';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderPageDto,
  PurchaseOrderViewDto,
  UpdatePurchaseOrderDto,
} from '../dto/purchasing.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// PUR-02, PUR-03, PUR-10, INV-20: the shop's purchases. Reading them needs inventory:read, and their costs
// inventory:manage (D3-9); making, changing, placing, cancelling and deleting them, inventory:manage.
@ApiTags('Purchasing')
@Controller('purchase-orders')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class PurchaseOrdersController {
  constructor(
    @Inject(PurchaseOrderService) private readonly orders: PurchaseOrderService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('PurchaseOrdersRetrieved')
  @ApiOperation({ summary: "The shop's purchases, newest first (PUR-02)" })
  @ZodResponse({ type: PurchaseOrderPageDto })
  async list(
    @Query(new ZodValidationPipe(purchaseOrderListQuerySchema)) query: PurchaseOrderListQuery,
    @Req() request: DashboardRequest,
  ): Promise<PurchaseOrderPage> {
    return this.orders.list(
      this.catalogue.tenantIdOf(request),
      query,
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }

  @Post()
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('PurchaseOrderCreated')
  @ApiOperation({ summary: 'Start a purchase, saved as a draft with no number yet (PUR-02)' })
  @ApiBody({ type: CreatePurchaseOrderDto })
  @ZodResponse({ type: PurchaseOrderViewDto })
  create(
    @Body(new ZodValidationPipe(CreatePurchaseOrderDto.schema)) body: CreatePurchaseOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<PurchaseOrderView> {
    return this.orders.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Get(':id')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('PurchaseOrderRetrieved')
  @ApiOperation({
    summary: 'One purchase, item by item, with what is still to come (PUR-02, PUR-05)',
  })
  @ZodResponse({ type: PurchaseOrderViewDto })
  async get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<PurchaseOrderView> {
    return this.orders.get(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'PurchaseNotFound'),
      await this.catalogue.holds(request, Permission.InventoryManage),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('PurchaseOrderUpdated')
  @ApiOperation({
    summary:
      "Change a purchase's details, and its items until the first delivery is received (PUR-02)",
  })
  @ApiBody({ type: UpdatePurchaseOrderDto })
  @ZodResponse({ type: PurchaseOrderViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePurchaseOrderDto.schema)) body: UpdatePurchaseOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<PurchaseOrderView> {
    return this.orders.update(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'PurchaseNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/place')
  @HttpCode(200)
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('PurchaseOrderPlaced')
  @ApiOperation({
    summary: "Place a draft with the supplier; it takes the shop's next number (PUR-02, PUR-03)",
  })
  @ZodResponse({ type: PurchaseOrderViewDto })
  place(@Param('id') id: string, @Req() request: DashboardRequest): Promise<PurchaseOrderView> {
    return this.orders.place(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'PurchaseNotFound'),
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('PurchaseOrderCancelled')
  @ApiOperation({ summary: 'Cancel a placed purchase with nothing received (PUR-02)' })
  @ZodResponse({ type: PurchaseOrderViewDto })
  cancel(@Param('id') id: string, @Req() request: DashboardRequest): Promise<PurchaseOrderView> {
    return this.orders.cancel(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'PurchaseNotFound'),
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('PurchaseOrderDeleted')
  @ApiOperation({
    summary: 'Delete a draft; a placed purchase is kept and cancelled instead (PUR-02)',
  })
  @ZodResponse({ type: OkDto })
  async remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.orders.remove(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'PurchaseNotFound'),
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }
}
