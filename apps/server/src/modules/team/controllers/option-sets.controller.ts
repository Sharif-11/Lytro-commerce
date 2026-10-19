import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OptionSetService } from '../../catalogue/services/option-set.service';
import type { OptionSetView } from '../../catalogue/types/catalogue';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { CreateOptionSetDto } from '../dto/catalogue.dto';
import { OptionSetViewDto } from '../dto/catalogue-response.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// ATR-16: the option sets offered while adding values to an attribute -- the platform's, then the shop's own -- and
// the shop saving or deleting its own.
@ApiTags('Catalogue')
@Controller('option-sets')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class OptionSetsController {
  constructor(
    @Inject(OptionSetService) private readonly sets: OptionSetService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ResponseMessage('OptionSetsListed')
  @ApiOperation({
    summary: "List the platform's option sets (the shop type's first) and the shop's own",
  })
  @ZodResponse({ type: [OptionSetViewDto] })
  async list(@Req() request: DashboardRequest): Promise<OptionSetView[]> {
    return this.sets.list(await this.catalogue.shopOf(request));
  }

  @Post()
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OptionSetCreated')
  @ApiOperation({ summary: "Save one of the shop's own option sets for reuse (ATR-16)" })
  @ApiBody({ type: CreateOptionSetDto })
  @ZodResponse({ type: OptionSetViewDto })
  create(
    @Body(new ZodValidationPipe(CreateOptionSetDto.schema)) body: CreateOptionSetDto,
    @Req() request: DashboardRequest,
  ): Promise<OptionSetView> {
    return this.sets.create(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.ProductsManage)
  @ResponseMessage('OptionSetDeleted')
  @ApiOperation({ summary: "Delete one of the shop's own option sets" })
  @ZodResponse({ type: OkDto })
  async remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.sets.delete(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'OptionSetNotFound'),
      this.catalogue.actorOf(request),
    );
    return { ok: true };
  }
}
