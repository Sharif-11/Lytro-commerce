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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  Permission,
  type TaxClassInput,
  type TaxClassUpdateInput,
  type TaxDefaultInput,
} from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { TaxClasses, type TaxClassesView } from '../../catalogue/services/tax-classes';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  TaxClassDto,
  TaxClassesViewDto,
  TaxClassUpdateDto,
  TaxDefaultDto,
} from '../dto/tax-classes.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// TAX-01 (Phase 4 Slice 4.6a, read agreed 2026-10-30): the shop's tax settings -- its named classes, each with a rate
// its prices include, and the one each new product starts with. The product form reads them with products:read;
// changing them needs settings:manage.
@ApiTags('Tax')
@Controller('tax-classes')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class TaxClassesController {
  constructor(
    @Inject(TaxClasses) private readonly taxes: TaxClasses,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission([Permission.ProductsRead, Permission.SettingsManage])
  @ResponseMessage('TaxClassesRetrieved')
  @ApiOperation({ summary: "The shop's tax classes, and the one new products start with (TAX-01)" })
  @ZodResponse({ type: TaxClassesViewDto })
  list(@Req() request: DashboardRequest): Promise<TaxClassesView> {
    return this.taxes.list(this.request.tenantIdOf(request));
  }

  @Post()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('TaxClassSaved')
  @ApiOperation({ summary: 'Name a tax class and its rate; prices include it (TAX-01)' })
  @ApiBody({ type: TaxClassDto })
  @ZodResponse({ type: TaxClassesViewDto })
  create(
    @Body(new ZodValidationPipe(TaxClassDto.schema)) body: TaxClassInput,
    @Req() request: DashboardRequest,
  ): Promise<TaxClassesView> {
    return this.taxes.create(this.request.tenantIdOf(request), body, this.request.actorOf(request));
  }

  @Put('default')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('TaxClassSaved')
  @ApiOperation({ summary: 'The class each new product starts with, or none (agreed 2026-10-30)' })
  @ApiBody({ type: TaxDefaultDto })
  @ZodResponse({ type: TaxClassesViewDto })
  setDefault(
    @Body(new ZodValidationPipe(TaxDefaultDto.schema)) body: TaxDefaultInput,
    @Req() request: DashboardRequest,
  ): Promise<TaxClassesView> {
    return this.taxes.setDefault(
      this.request.tenantIdOf(request),
      body.taxClassId,
      this.request.actorOf(request),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('TaxClassSaved')
  @ApiOperation({
    summary: 'Rename or re-rate a class, for orders from now on; past orders keep theirs (TAX-02)',
  })
  @ApiBody({ type: TaxClassUpdateDto })
  @ZodResponse({ type: TaxClassesViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TaxClassUpdateDto.schema)) body: TaxClassUpdateInput,
    @Req() request: DashboardRequest,
  ): Promise<TaxClassesView> {
    return this.taxes.update(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'TaxClassNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('TaxClassDeleted')
  @ApiOperation({ summary: 'Delete a class no product uses; the default is cleared with it' })
  @ZodResponse({ type: TaxClassesViewDto })
  remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<TaxClassesView> {
    return this.taxes.remove(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'TaxClassNotFound'),
      this.request.actorOf(request),
    );
  }
}
