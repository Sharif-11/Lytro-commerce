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
  deleteCategoryQuerySchema,
  Permission,
  type DeleteCategoryQuery,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { CategoryService } from '../../catalogue/services/category.service';
import { SizeChartService, type SizeChartRows } from '../../catalogue/services/size-chart.service';
import type { CategoryView } from '../../catalogue/types/catalogue';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  CategoryAttributesDto,
  CreateCategoryDto,
  SizeChartDto,
  UpdateCategoryDto,
} from '../dto/catalogue.dto';
import { CategoryViewDto, SizeChartRowsDto } from '../dto/catalogue-response.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// PRD-03, ATR-02, ATL-05: a shop's category tree and each category's suggested attributes.
@ApiTags('Catalogue')
@Controller('categories')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class CategoriesController {
  constructor(
    @Inject(CategoryService) private readonly categories: CategoryService,
    @Inject(SizeChartService) private readonly charts: SizeChartService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('CategoriesListed')
  @ApiOperation({ summary: "List the shop's categories, top level first (PRD-03)" })
  @ZodResponse({ type: [CategoryViewDto] })
  list(@Req() request: DashboardRequest): Promise<CategoryView[]> {
    return this.categories.list(this.catalogue.tenantIdOf(request));
  }

  @Post()
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('CategoryCreated')
  @ApiOperation({ summary: 'Add a category, up to four levels deep (PRD-03)' })
  @ApiBody({ type: CreateCategoryDto })
  @ZodResponse({ type: CategoryViewDto })
  create(
    @Body(new ZodValidationPipe(CreateCategoryDto.schema)) body: CreateCategoryDto,
    @Req() request: DashboardRequest,
  ): Promise<CategoryView> {
    return this.categories.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('CategoryUpdated')
  @ApiOperation({ summary: 'Rename, move, reorder, show or hide a category' })
  @ApiBody({ type: UpdateCategoryDto })
  @ZodResponse({ type: CategoryViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCategoryDto.schema)) body: UpdateCategoryDto,
    @Req() request: DashboardRequest,
  ): Promise<CategoryView> {
    return this.categories.update(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'CategoryNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('CategoryDeleted')
  @ApiOperation({
    summary: 'Delete a category; ?products=uncategorize moves its products to Uncategorized',
  })
  @ZodResponse({ type: OkDto })
  async remove(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(deleteCategoryQuerySchema)) query: DeleteCategoryQuery,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.categories.delete(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'CategoryNotFound'),
      query,
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }

  @Put(':id/attributes')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('CategorySuggestionsSaved')
  @ApiOperation({ summary: "Set the attributes suggested for a category's products (ATR-02)" })
  @ApiBody({ type: CategoryAttributesDto })
  @ZodResponse({ type: CategoryViewDto })
  setSuggestions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CategoryAttributesDto.schema)) body: CategoryAttributesDto,
    @Req() request: DashboardRequest,
  ): Promise<CategoryView> {
    return this.categories.setSuggestions(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'CategoryNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put(':id/size-chart')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('SizeChartSaved')
  @ApiOperation({
    summary: "Set the category's size chart, shown on its products without their own (PRD-17)",
  })
  @ApiBody({ type: SizeChartDto })
  @ZodResponse({ type: SizeChartRowsDto })
  setSizeChart(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SizeChartDto.schema)) body: SizeChartDto,
    @Req() request: DashboardRequest,
  ): Promise<SizeChartRows> {
    return this.charts.setOnCategory(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'CategoryNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id/size-chart')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('SizeChartRemoved')
  @ApiOperation({ summary: "Remove the category's size chart (PRD-17)" })
  @ZodResponse({ type: OkDto })
  async removeSizeChart(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.charts.removeFromCategory(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'CategoryNotFound'),
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }
}
