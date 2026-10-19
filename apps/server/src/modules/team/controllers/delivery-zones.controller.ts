import {
  Body,
  Controller,
  Delete,
  Get,
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
  resolveDeliveryZoneQuerySchema,
  type ResolveDeliveryZoneQuery,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DeliveryZoneService } from '../../delivery/services/delivery-zone.service';
import type { DeliverySettingsView, ResolvedZoneView } from '../../delivery/types/delivery';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  CreateDeliveryZoneDto,
  DeliverySettingsViewDto,
  DeliveryZoneAreasDto,
  HomeAreaDto,
  ResolvedZoneViewDto,
  UpdateDeliveryZoneDto,
} from '../dto/delivery.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// DLV-01 to DLV-07: the shop's delivery zones. Reading them is part of working with products (the product editor's
// zone limit, and order entry from Phase 4); changing them is a shop setting. Every write answers with the whole
// delivery settings, since a home-area change renames two zones at once.
@ApiTags('Delivery')
@Controller('delivery-zones')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class DeliveryZonesController {
  constructor(
    @Inject(DeliveryZoneService) private readonly zones: DeliveryZoneService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('DeliveryZonesListed')
  @ApiOperation({
    summary: 'The home area and every delivery zone with its charge and areas (DLV-05)',
  })
  @ZodResponse({ type: DeliverySettingsViewDto })
  settings(@Req() request: DashboardRequest): Promise<DeliverySettingsView> {
    return this.zones.settings(this.catalogue.tenantIdOf(request));
  }

  @Get('resolve')
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('DeliveryZoneResolved')
  @ApiOperation({ summary: 'Which zone, and which charge, a thana falls in (DLV-02, DLV-05)' })
  @ZodResponse({ type: ResolvedZoneViewDto })
  resolve(
    @Query(new ZodValidationPipe(resolveDeliveryZoneQuerySchema)) query: ResolveDeliveryZoneQuery,
    @Req() request: DashboardRequest,
  ): Promise<ResolvedZoneView> {
    return this.zones.resolve(this.catalogue.tenantIdOf(request), query.locationId);
  }

  @Put('home-area')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('HomeAreaSaved')
  @ApiOperation({
    summary:
      'Set the home area (a city, a district or your own thanas); the inside and outside zones follow it (DLV-01)',
  })
  @ApiBody({ type: HomeAreaDto })
  @ZodResponse({ type: DeliverySettingsViewDto })
  setHomeArea(
    @Body(new ZodValidationPipe(HomeAreaDto.schema)) body: HomeAreaDto,
    @Req() request: DashboardRequest,
  ): Promise<DeliverySettingsView> {
    return this.zones.setHomeArea(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Post()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DeliveryZoneCreated')
  @ApiOperation({
    summary: 'Add a delivery zone with its charge and areas, up to 20 in all (DLV-01)',
  })
  @ApiBody({ type: CreateDeliveryZoneDto })
  @ZodResponse({ type: DeliverySettingsViewDto })
  create(
    @Body(new ZodValidationPipe(CreateDeliveryZoneDto.schema)) body: CreateDeliveryZoneDto,
    @Req() request: DashboardRequest,
  ): Promise<DeliverySettingsView> {
    return this.zones.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DeliveryZoneUpdated')
  @ApiOperation({
    summary:
      'Rename, re-price or mark a zone "no delivery"; existing orders keep their charge (DLV-04)',
  })
  @ApiBody({ type: UpdateDeliveryZoneDto })
  @ZodResponse({ type: DeliverySettingsViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDeliveryZoneDto.schema)) body: UpdateDeliveryZoneDto,
    @Req() request: DashboardRequest,
  ): Promise<DeliverySettingsView> {
    return this.zones.update(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'DeliveryZoneNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put(':id/areas')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DeliveryZoneUpdated')
  @ApiOperation({ summary: "Replace one of the shop's own zones' areas (DLV-01, DLV-02)" })
  @ApiBody({ type: DeliveryZoneAreasDto })
  @ZodResponse({ type: DeliverySettingsViewDto })
  setAreas(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DeliveryZoneAreasDto.schema)) body: DeliveryZoneAreasDto,
    @Req() request: DashboardRequest,
  ): Promise<DeliverySettingsView> {
    return this.zones.setAreas(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'DeliveryZoneNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('DeliveryZoneDeleted')
  @ApiOperation({
    summary:
      "Delete one of the shop's own zones; refused while a product's delivery limit names it (DLV-07)",
  })
  @ZodResponse({ type: DeliverySettingsViewDto })
  remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<DeliverySettingsView> {
    return this.zones.delete(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'DeliveryZoneNotFound'),
      this.catalogue.actorOf(request),
    );
  }
}
