import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
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
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { StorefrontDesignService } from '../../storefront-design/services/storefront-design.service';
import type {
  StorefrontEditorView,
  StorefrontPreviewLink,
} from '../../storefront-design/types/storefront-design';
import {
  SaveStorefrontDesignDto,
  StorefrontEditorDto,
  StorefrontPreviewLinkDto,
} from '../dto/storefront-design.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// SB-12, SB-13: the storefront design editor's routes, for whoever manages the shop's settings, as the brand editor's
// are. Like the rest of Settings, not reachable while lapsed or suspended.
@ApiTags('Storefront design')
@Controller('storefront/design')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class StorefrontDesignController {
  constructor(
    @Inject(StorefrontDesignService) private readonly designs: StorefrontDesignService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('StorefrontDesignRetrieved')
  @ApiOperation({
    summary:
      "The shop's storefront design to edit: the draft, else the live one, else its type's starting one (SB-11, SB-12)",
  })
  @ZodResponse({ type: StorefrontEditorDto })
  get(@Req() request: DashboardRequest): Promise<StorefrontEditorView> {
    return this.designs.editor(this.catalogue.tenantIdOf(request));
  }

  @Put()
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('StorefrontDraftSaved')
  @ApiOperation({
    summary: 'Save the draft whole; shoppers see nothing until it is published (SB-12)',
  })
  @ApiBody({ type: SaveStorefrontDesignDto })
  @ZodResponse({ type: StorefrontEditorDto })
  save(
    @Body(new ZodValidationPipe(SaveStorefrontDesignDto.schema)) body: SaveStorefrontDesignDto,
    @Req() request: DashboardRequest,
  ): Promise<StorefrontEditorView> {
    return this.designs.saveDraft(this.catalogue.tenantIdOf(request), body.design);
  }

  @Delete('draft')
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('StorefrontDraftDiscarded')
  @ApiOperation({ summary: 'Drop the draft, back to the live design (SB-12)' })
  @ZodResponse({ type: StorefrontEditorDto })
  discard(@Req() request: DashboardRequest): Promise<StorefrontEditorView> {
    return this.designs.discardDraft(this.catalogue.tenantIdOf(request));
  }

  @Post('publish')
  @HttpCode(200)
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('StorefrontPublished')
  @ApiOperation({
    summary: "Make the draft live; the shop's pages leave the edge cache at once (SB-12, SB-13)",
  })
  @ZodResponse({ type: StorefrontEditorDto })
  publish(@Req() request: DashboardRequest): Promise<StorefrontEditorView> {
    return this.designs.publish(
      this.catalogue.tenantIdOf(request),
      this.catalogue.actorOf(request),
    );
  }

  @Post('back')
  @HttpCode(200)
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('StorefrontWentBack')
  @ApiOperation({ summary: 'Put the previous design back live (SB-12, SB-13)' })
  @ZodResponse({ type: StorefrontEditorDto })
  back(@Req() request: DashboardRequest): Promise<StorefrontEditorView> {
    return this.designs.back(this.catalogue.tenantIdOf(request), this.catalogue.actorOf(request));
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission(Permission.SettingsManage)
  @ResponseMessage('StorefrontPreviewLinkMade')
  @ApiOperation({
    summary:
      'A short-lived link that shows the storefront drawn from the draft, never cached (SB-12)',
  })
  @ZodResponse({ type: StorefrontPreviewLinkDto })
  preview(@Req() request: DashboardRequest): StorefrontPreviewLink {
    return this.designs.previewLink(this.catalogue.tenantIdOf(request));
  }
}
