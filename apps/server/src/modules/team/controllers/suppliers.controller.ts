import {
  Body,
  Controller,
  Get,
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
import { Permission, supplierListQuerySchema, type SupplierListQuery } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { SupplierService } from '../../purchasing/services/supplier.service';
import type { SupplierPage, SupplierView } from '../../purchasing/types/purchasing';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  CreateSupplierDto,
  SupplierPageDto,
  SupplierViewDto,
  UpdateSupplierDto,
} from '../dto/purchasing.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// PUR-01, INV-20: the shop's suppliers. Reading them needs inventory:read; adding, changing and archiving them,
// inventory:manage.
@ApiTags('Purchasing')
@Controller('suppliers')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class SuppliersController {
  constructor(
    @Inject(SupplierService) private readonly suppliers: SupplierService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('SuppliersRetrieved')
  @ApiOperation({ summary: "The shop's live suppliers, or its archived ones, by name (PUR-01)" })
  @ZodResponse({ type: SupplierPageDto })
  list(
    @Query(new ZodValidationPipe(supplierListQuerySchema)) query: SupplierListQuery,
    @Req() request: DashboardRequest,
  ): Promise<SupplierPage> {
    return this.suppliers.list(this.catalogue.tenantIdOf(request), query);
  }

  @Post()
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('SupplierCreated')
  @ApiOperation({ summary: 'Add a supplier; its name is unique among the live ones (PUR-01)' })
  @ApiBody({ type: CreateSupplierDto })
  @ZodResponse({ type: SupplierViewDto })
  create(
    @Body(new ZodValidationPipe(CreateSupplierDto.schema)) body: CreateSupplierDto,
    @Req() request: DashboardRequest,
  ): Promise<SupplierView> {
    return this.suppliers.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Get(':id')
  @RequirePermission(Permission.InventoryRead)
  @ResponseMessage('SupplierRetrieved')
  @ApiOperation({ summary: 'One supplier (PUR-01)' })
  @ZodResponse({ type: SupplierViewDto })
  get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<SupplierView> {
    return this.suppliers.get(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'SupplierNotFound'),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.InventoryManage)
  @ResponseMessage('SupplierUpdated')
  @ApiOperation({ summary: "Change a supplier's details, or archive it or bring it back (PUR-01)" })
  @ApiBody({ type: UpdateSupplierDto })
  @ZodResponse({ type: SupplierViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSupplierDto.schema)) body: UpdateSupplierDto,
    @Req() request: DashboardRequest,
  ): Promise<SupplierView> {
    return this.suppliers.update(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'SupplierNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }
}
