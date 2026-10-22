import { Body, Controller, Get, Inject, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { BrandService } from '../../brand/services/brand.service';
import type { BrandEditorView } from '../../brand/types/brand';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { BrandEditorDto, BrandSwitchDto, SaveBrandDto } from '../dto/brand.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// BRN-02 to BRN-06: the brand identity editor's routes, for whoever manages the shop's settings. Like the rest of
// Settings, not reachable while lapsed or suspended.
@ApiTags('Brand identity')
@Controller('brand')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class BrandController {
  constructor(
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('BrandRetrieved')
  @ApiOperation({
    summary:
      "The shop's brand identity, its switch, whether it shows, and its contrast check (BRN-02, BRN-03, BRN-05)",
  })
  @ZodResponse({ type: BrandEditorDto })
  get(@Req() request: DashboardRequest): Promise<BrandEditorView> {
    return this.brand.editor(this.catalogue.tenantIdOf(request));
  }

  @Put()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('BrandSaved')
  @ApiOperation({
    summary: 'Save the brand identity whole, and switch it on or off with it (BRN-02, BRN-03)',
  })
  @ApiBody({ type: SaveBrandDto })
  @ZodResponse({ type: BrandEditorDto })
  save(
    @Body(new ZodValidationPipe(SaveBrandDto.schema)) body: SaveBrandDto,
    @Req() request: DashboardRequest,
  ): Promise<BrandEditorView> {
    return this.brand.save(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Put('switch')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('BrandSaved')
  @ApiOperation({ summary: '"Use my brand", on or off, keeping the identity (BRN-02, BRN-05)' })
  @ApiBody({ type: BrandSwitchDto })
  @ZodResponse({ type: BrandEditorDto })
  setSwitch(
    @Body(new ZodValidationPipe(BrandSwitchDto.schema)) body: BrandSwitchDto,
    @Req() request: DashboardRequest,
  ): Promise<BrandEditorView> {
    return this.brand.setSwitch(
      this.catalogue.tenantIdOf(request),
      body.useBrand,
      this.catalogue.actorOf(request),
    );
  }
}
