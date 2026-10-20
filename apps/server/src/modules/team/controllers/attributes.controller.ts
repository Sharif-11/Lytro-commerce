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
import { listAttributesSchema, Permission, type ListAttributesQuery } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { AttributeService } from '../../catalogue/services/attribute.service';
import type { AttributeView, OptionView } from '../../catalogue/types/catalogue';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  AddOptionsDto,
  CreateAttributeDto,
  CreateShopOptionDto,
  UpdateAttributeDto,
  UpdateShopOptionDto,
} from '../dto/catalogue.dto';
import { AttributeViewDto, OptionViewDto } from '../dto/catalogue-response.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// ATL-01, ATR-01, ATR-10, ATR-16, ATR-18, UOM-02: the attribute library a shop sees (the platform's and its own),
// and its own attributes and values (with their swatches), made inline while editing a product.
@ApiTags('Catalogue')
@Controller('attributes')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class AttributesController {
  constructor(
    @Inject(AttributeService) private readonly attributes: AttributeService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('AttributesListed')
  @ApiOperation({
    summary: "List the platform's attributes and the shop's own, with their options",
  })
  @ZodResponse({ type: [AttributeViewDto] })
  list(
    @Query(new ZodValidationPipe(listAttributesSchema)) query: ListAttributesQuery,
    @Req() request: DashboardRequest,
  ): Promise<AttributeView[]> {
    return this.attributes.list(this.catalogue.tenantIdOf(request), query.includeRetired ?? false);
  }

  @Post()
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('AttributeCreated')
  @ApiOperation({ summary: "Add one of the shop's own attributes (ATR-01)" })
  @ApiBody({ type: CreateAttributeDto })
  @ZodResponse({ type: AttributeViewDto })
  create(
    @Body(new ZodValidationPipe(CreateAttributeDto.schema)) body: CreateAttributeDto,
    @Req() request: DashboardRequest,
  ): Promise<AttributeView> {
    return this.attributes.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('AttributeUpdated')
  @ApiOperation({ summary: "Rename or retire one of the shop's own attributes (ATR-10)" })
  @ApiBody({ type: UpdateAttributeDto })
  @ZodResponse({ type: AttributeViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAttributeDto.schema)) body: UpdateAttributeDto,
    @Req() request: DashboardRequest,
  ): Promise<AttributeView> {
    return this.attributes.update(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'AttributeNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/options')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OptionCreated')
  @ApiOperation({
    summary:
      "Add one of the shop's own values to an attribute with options, with a colour or image swatch (ATR-18)",
  })
  @ApiBody({ type: CreateShopOptionDto })
  @ZodResponse({ type: OptionViewDto })
  addOption(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateShopOptionDto.schema)) body: CreateShopOptionDto,
    @Req() request: DashboardRequest,
  ): Promise<OptionView> {
    return this.attributes.addOption(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'AttributeNotFound'),
      body,
    );
  }

  @Post(':id/options/batch')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OptionsAdded')
  @ApiOperation({
    summary:
      'Add several values at once, as an option set does; values already there are reused (ATR-16)',
  })
  @ApiBody({ type: AddOptionsDto })
  @ZodResponse({ type: [OptionViewDto] })
  addOptions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddOptionsDto.schema)) body: AddOptionsDto,
    @Req() request: DashboardRequest,
  ): Promise<OptionView[]> {
    return this.attributes.addOptions(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'AttributeNotFound'),
      body,
    );
  }

  @Patch(':id/options/:optionId')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OptionUpdated')
  @ApiOperation({
    summary:
      "Rename, re-colour, give an image swatch or retire one of the shop's own values (ATR-18)",
  })
  @ApiBody({ type: UpdateShopOptionDto })
  @ZodResponse({ type: OptionViewDto })
  updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body(new ZodValidationPipe(UpdateShopOptionDto.schema)) body: UpdateShopOptionDto,
    @Req() request: DashboardRequest,
  ): Promise<OptionView> {
    return this.attributes.updateOption(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'AttributeNotFound'),
      this.catalogue.idOf(optionId, 'OptionNotFound'),
      body,
    );
  }
}
