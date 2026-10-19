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
  deleteProductQuerySchema,
  listProductsSchema,
  Permission,
  type DeleteProductQuery,
  type ListProductsQuery,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { ProductService } from '../../catalogue/services/product.service';
import { SizeChartService, type SizeChartRows } from '../../catalogue/services/size-chart.service';
import type { ProductDetail, ProductPage } from '../../catalogue/types/catalogue';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  ChangeProductSlugDto,
  CreateProductDto,
  ProductDeliveryZonesDto,
  SaveProductAttributesDto,
  SaveVariantsDto,
  SizeChartDto,
  UpdateProductDto,
} from '../dto/catalogue.dto';
import { ProductDetailDto, ProductPageDto, SizeChartRowsDto } from '../dto/catalogue-response.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// PRD-01 to PRD-05, PRD-12, PRD-13, PRD-17, PRD-18, ATR-03 to ATR-15, LND-04, PYG-16: a shop's products, their
// attributes and variants, size charts and link slugs, and duplicating one. Each write moves the catalogue version
// (CCH-02).
@ApiTags('Catalogue')
@Controller('products')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ProductsController {
  constructor(
    @Inject(ProductService) private readonly products: ProductService,
    @Inject(SizeChartService) private readonly charts: SizeChartService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Post(':id/duplicate')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductDuplicated')
  @ApiOperation({
    summary:
      'Copy a product with its categories, attributes, variants and size chart, inactive and with a new slug (PRD-18)',
  })
  @ZodResponse({ type: ProductDetailDto })
  async duplicate(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.duplicate(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.actorOf(request),
    );
  }

  @Put(':id/delivery-zones')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductDeliveryZonesSaved')
  @ApiOperation({
    summary: 'Limit where the product may be delivered; an empty list lifts the limit (DLV-07)',
  })
  @ApiBody({ type: ProductDeliveryZonesDto })
  @ZodResponse({ type: ProductDetailDto })
  async setDeliveryZones(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ProductDeliveryZonesDto.schema)) body: ProductDeliveryZonesDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.setDeliveryZones(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put(':id/size-chart')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('SizeChartSaved')
  @ApiOperation({
    summary: "Set the product's own size chart, in place of its category's (PRD-17)",
  })
  @ApiBody({ type: SizeChartDto })
  @ZodResponse({ type: SizeChartRowsDto })
  setSizeChart(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SizeChartDto.schema)) body: SizeChartDto,
    @Req() request: DashboardRequest,
  ): Promise<SizeChartRows> {
    return this.charts.setOnProduct(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id/size-chart')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('SizeChartRemoved')
  @ApiOperation({
    summary: "Remove the product's own size chart; its category's shows again (PRD-17)",
  })
  @ZodResponse({ type: OkDto })
  async removeSizeChart(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.charts.removeFromProduct(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('ProductsListed')
  @ApiOperation({ summary: 'Search and list products, 20 to a page (PRD-12)' })
  @ZodResponse({ type: ProductPageDto })
  list(
    @Query(new ZodValidationPipe(listProductsSchema)) query: ListProductsQuery,
    @Req() request: DashboardRequest,
  ): Promise<ProductPage> {
    return this.products.list(this.catalogue.tenantIdOf(request), query);
  }

  @Post()
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductCreated')
  @ApiOperation({
    summary: 'Create a product with its attributes and variants, in one go (PRD-01, ATR-11)',
  })
  @ApiBody({ type: CreateProductDto })
  @ZodResponse({ type: ProductDetailDto })
  async create(
    @Body(new ZodValidationPipe(CreateProductDto.schema)) body: CreateProductDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.create(
      await this.catalogue.shopOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Get(':id')
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('ProductRetrieved')
  @ApiOperation({ summary: 'A product with its attributes, variants and old links' })
  @ZodResponse({ type: ProductDetailDto })
  get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<ProductDetail> {
    return this.products.get(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductUpdated')
  @ApiOperation({ summary: "Update a product's own fields; the link slug stays (PRD-05, LND-04)" })
  @ApiBody({ type: UpdateProductDto })
  @ZodResponse({ type: ProductDetailDto })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductDto.schema)) body: UpdateProductDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.update(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductDeleted')
  @ApiOperation({ summary: 'Archive a product, or delete it for good with ?hard=true (PRD-13)' })
  @ZodResponse({ type: OkDto })
  async remove(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(deleteProductQuerySchema)) query: DeleteProductQuery,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.products.delete(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      query.hard ?? false,
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }

  @Put(':id/variants')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductVariantsSaved')
  @ApiOperation({ summary: 'Save the variant-defining attributes and the variants (ATR-11)' })
  @ApiBody({ type: SaveVariantsDto })
  @ZodResponse({ type: ProductDetailDto })
  async saveVariants(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SaveVariantsDto.schema)) body: SaveVariantsDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.saveVariants(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put(':id/attributes')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductAttributesSaved')
  @ApiOperation({
    summary: 'Save the attributes that describe the product or are asked when ordering',
  })
  @ApiBody({ type: SaveProductAttributesDto })
  @ZodResponse({ type: ProductDetailDto })
  async saveAttributes(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SaveProductAttributesDto.schema)) body: SaveProductAttributesDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.saveAttributes(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put(':id/slug')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('ProductSlugChanged')
  @ApiOperation({ summary: "Change a product's link; the old one keeps redirecting (LND-04)" })
  @ApiBody({ type: ChangeProductSlugDto })
  @ZodResponse({ type: ProductDetailDto })
  async changeSlug(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ChangeProductSlugDto.schema)) body: ChangeProductSlugDto,
    @Req() request: DashboardRequest,
  ): Promise<ProductDetail> {
    return this.products.changeSlug(
      await this.catalogue.shopOf(request),
      this.catalogue.idOf(id, 'ProductNotFound'),
      body.slug,
      this.catalogue.actorOf(request),
    );
  }
}
