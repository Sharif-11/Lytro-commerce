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
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OfferService,
  type OfferPickableView,
  type OfferPreviewView,
  type OfferView,
  type OffersView,
} from '../../catalogue/services/offer.service';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  CreateOfferDto,
  OfferPickableQueryDto,
  OfferPickableViewDto,
  OfferPreviewDto,
  OfferPreviewViewDto,
  OfferViewDto,
  OffersViewDto,
  UpdateOfferDto,
} from '../dto/offers.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// OFFERS-PLAN (the owner, 2026-11-18 and 19): the shop's offers -- named price cuts on chosen products or designs,
// made ready, run, changed live, ended, run again. Reading them needs products:read; changing them, products:manage,
// as they change prices (OF-24).
@ApiTags('Offers')
@Controller('offers')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class OffersController {
  constructor(
    @Inject(OfferService) private readonly offers: OfferService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('OffersRetrieved')
  @ApiOperation({ summary: "The shop's offers: running, not started and ended (OF-14)" })
  @ZodResponse({ type: OffersViewDto })
  list(@Req() request: DashboardRequest): Promise<OffersView> {
    return this.offers.list(this.catalogue.tenantIdOf(request));
  }

  @Get('pickable')
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('OffersRetrieved')
  @ApiOperation({
    summary: "The picker's products, their designs, and the offer holding each (OF-25)",
  })
  @ZodResponse({ type: OfferPickableViewDto })
  pickable(
    @Query(new ZodValidationPipe(OfferPickableQueryDto.schema)) query: OfferPickableQueryDto,
    @Req() request: DashboardRequest,
  ): Promise<OfferPickableView> {
    return this.offers.pickable(this.catalogue.tenantIdOf(request), query);
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferPreviewed')
  @ApiOperation({ summary: "Each product's prices before and in an offer, nothing saved (OF-2)" })
  @ApiBody({ type: OfferPreviewDto })
  @ZodResponse({ type: OfferPreviewViewDto })
  preview(
    @Body(new ZodValidationPipe(OfferPreviewDto.schema)) body: OfferPreviewDto,
    @Req() request: DashboardRequest,
  ): Promise<OfferPreviewView> {
    return this.offers.preview(this.catalogue.tenantIdOf(request), body);
  }

  @Post()
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferSaved')
  @ApiOperation({ summary: 'A new offer, started at once or kept for later (OF-1, OF-14)' })
  @ApiBody({ type: CreateOfferDto })
  @ZodResponse({ type: OfferViewDto })
  create(
    @Body(new ZodValidationPipe(CreateOfferDto.schema)) body: CreateOfferDto,
    @Req() request: DashboardRequest,
  ): Promise<OfferView> {
    return this.offers.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Get(':id')
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('OfferRetrieved')
  @ApiOperation({ summary: 'An offer and its products, with their prices (OF-2, OF-12)' })
  @ZodResponse({ type: OfferViewDto })
  read(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OfferView> {
    return this.offers.read(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OfferNotFound'),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferSaved')
  @ApiOperation({ summary: "An offer's name, cut or products; live at once while it runs (OF-15)" })
  @ApiBody({ type: UpdateOfferDto })
  @ZodResponse({ type: OfferViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOfferDto.schema)) body: UpdateOfferDto,
    @Req() request: DashboardRequest,
  ): Promise<OfferView> {
    return this.offers.update(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OfferNotFound'),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/start')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferStarted')
  @ApiOperation({ summary: 'Start an offer made ready: its prices in the shop at once (OF-14)' })
  @ZodResponse({ type: OfferViewDto })
  start(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OfferView> {
    return this.offers.start(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OfferNotFound'),
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/end')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferEnded')
  @ApiOperation({ summary: 'End a running offer: every price it set goes back (OF-3, OF-20)' })
  @ZodResponse({ type: OfferViewDto })
  end(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OfferView> {
    return this.offers.end(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OfferNotFound'),
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/copy')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferCopied')
  @ApiOperation({ summary: 'Run it again: a copy, not started, of an offer (OF-14)' })
  @ZodResponse({ type: OfferViewDto })
  copy(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OfferView> {
    return this.offers.copy(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OfferNotFound'),
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OfferDeleted')
  @ApiOperation({ summary: 'Delete an offer not running (OF-14)' })
  @ZodResponse({ type: OffersViewDto })
  remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OffersView> {
    return this.offers.remove(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OfferNotFound'),
      this.catalogue.actorOf(request),
    );
  }
}
