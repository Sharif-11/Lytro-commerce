import { Body, Controller, Get, Inject, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  Permission,
  productDefaultsQuerySchema,
  type ProductDefaultsQuery,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PresetService } from '../../catalogue/services/preset.service';
import type { PresetView, ProductDefaults } from '../../catalogue/types/catalogue';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { SetBusinessTypeDto } from '../dto/catalogue.dto';
import { PresetViewDto, ProductDefaultsDto } from '../dto/catalogue-response.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// PST-01, PST-02, PST-05, PST-06: the shop types, what a new product starts with in this shop (or under one of its
// categories), and the shop's own choice.
@ApiTags('Catalogue')
@Controller()
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class CatalogueSetupController {
  constructor(
    @Inject(PresetService) private readonly presets: PresetService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get('presets')
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('PresetsListed')
  @ApiOperation({
    summary: 'List the shop types and the defaults each gives a new product (PST-01, PST-02)',
  })
  @ZodResponse({ type: [PresetViewDto] })
  list(): Promise<PresetView[]> {
    return this.presets.list();
  }

  @Get('product-defaults')
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('ProductDefaultsRetrieved')
  @ApiOperation({
    summary:
      'What a new product starts with: from the category it is filed under when that behaves like a shop type, else the shop type (PST-02, PST-05, PST-06)',
  })
  @ZodResponse({ type: ProductDefaultsDto })
  async defaults(
    @Query(new ZodValidationPipe(productDefaultsQuerySchema)) query: ProductDefaultsQuery,
    @Req() request: DashboardRequest,
  ): Promise<ProductDefaults> {
    return this.presets.productDefaults(
      await this.catalogue.shopOf(request),
      query.categoryId ?? null,
    );
  }

  @Put('business-type')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('BusinessTypeSaved')
  @ApiOperation({
    summary: "Set or clear the shop's business type (PST-01); existing products stay as they are",
  })
  @ApiBody({ type: SetBusinessTypeDto })
  @ZodResponse({ type: ProductDefaultsDto })
  async setBusinessType(
    @Body(new ZodValidationPipe(SetBusinessTypeDto.schema)) body: SetBusinessTypeDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDefaults> {
    const shop = await this.catalogue.shopOf(request);
    return this.presets.setBusinessType(
      shop.id,
      shop.businessType,
      body.businessType,
      this.catalogue.actorOf(request),
    );
  }
}
