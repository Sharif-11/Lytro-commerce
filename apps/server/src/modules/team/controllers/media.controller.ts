import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { mediaListQuerySchema, Permission, type MediaListQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { MediaBandwidth } from '../../media/services/media-bandwidth';
import { MEDIA_PURPOSE_PERMISSION, MediaService } from '../../media/services/media.service';
import type {
  BandwidthUsage,
  MediaDetail,
  MediaPage,
  MediaView,
  StorageUsage,
  UploadStarted,
} from '../../media/types/media';
import {
  BandwidthUsageDto,
  MediaDetailDto,
  MediaPageDto,
  MediaViewDto,
  StartUploadDto,
  StorageUsageDto,
  UploadStartedDto,
} from '../dto/media.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// STF-11: who may add or remove media: the catalogue's managers, or for the logo the shop's settings managers. Each
// route then checks the exact one the item's purpose needs.
const MEDIA_WRITERS = [Permission.ProductsManage, Permission.SettingsManage] as const;
// MED-09, STO-02, BND-08: who may see the library, the storage it uses and the bandwidth it sends.
const MEDIA_READERS = [
  Permission.ProductsRead,
  Permission.ProductsManage,
  Permission.SettingsManage,
] as const;

// MED-03, MED-09, STO-01 to STO-03, STO-07: a shop's media. An upload starts with the file's details only, and is
// answered with a link the browser sends the file to; finishing hands it to processing. The library lists the shop's
// ready media; deleting an item removes it from everywhere it shows.
@ApiTags('Media')
@Controller('media')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(MediaBandwidth) private readonly bandwidth: MediaBandwidth,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Post('uploads')
  @RequirePermission(MEDIA_WRITERS)
  @ResponseMessage('UploadStarted')
  @ApiOperation({
    summary:
      "Start an upload: the file's kind, type, size and purpose, checked against the limits and the shop's storage; " +
      'answered with a link the browser sends exactly that file to (MED-03, STO-03)',
  })
  @ApiBody({ type: StartUploadDto })
  @ZodResponse({ type: UploadStartedDto })
  async startUpload(
    @Body(new ZodValidationPipe(StartUploadDto.schema)) body: StartUploadDto,
    @Req() request: DashboardRequest,
  ): Promise<UploadStarted> {
    await this.refuseWithout(request, MEDIA_PURPOSE_PERMISSION[body.purpose]);
    return this.media.startUpload(
      this.catalogue.tenantIdOf(request),
      body,
      this.catalogue.actorOf(request),
    );
  }

  @Post(':id/finish')
  @RequirePermission(MEDIA_WRITERS)
  @ResponseMessage('UploadFinished')
  @ApiOperation({
    summary: 'Say the file was sent; it is checked and prepared in the background (MED-03)',
  })
  @ZodResponse({ type: MediaViewDto })
  async finish(@Param('id') id: string, @Req() request: DashboardRequest): Promise<MediaView> {
    const tenantId = this.catalogue.tenantIdOf(request);
    const mediaId = this.catalogue.idOf(id, 'MediaNotFound');
    const purpose = await this.media.purposeOf(tenantId, mediaId);
    await this.refuseWithout(request, MEDIA_PURPOSE_PERMISSION[purpose]);
    return this.media.finishUpload(tenantId, mediaId);
  }

  @Get()
  @RequirePermission(MEDIA_READERS)
  @ResponseMessage('MediaListed')
  @ApiOperation({ summary: "The shop's ready media, newest first (MED-09)" })
  @ZodResponse({ type: MediaPageDto })
  list(
    @Query(new ZodValidationPipe(mediaListQuerySchema)) query: MediaListQuery,
    @Req() request: DashboardRequest,
  ): Promise<MediaPage> {
    return this.media.list(this.catalogue.tenantIdOf(request), query);
  }

  @Get('usage')
  @RequirePermission(MEDIA_READERS)
  @ResponseMessage('StorageUsageRetrieved')
  @ApiOperation({
    summary: "The storage the shop's media uses, and its plan's limit (STO-01, STO-02)",
  })
  @ZodResponse({ type: StorageUsageDto })
  usage(@Req() request: DashboardRequest): Promise<StorageUsage> {
    return this.media.usage(this.catalogue.tenantIdOf(request));
  }

  @Get('bandwidth')
  @RequirePermission(MEDIA_READERS)
  @ResponseMessage('BandwidthRetrieved')
  @ApiOperation({
    summary:
      "The bandwidth the shop's media has sent this billing cycle, its plan's limit, and each day of it " +
      '(BND-01, BND-06, BND-08)',
  })
  @ZodResponse({ type: BandwidthUsageDto })
  bandwidthUsage(@Req() request: DashboardRequest): Promise<BandwidthUsage> {
    return this.bandwidth.usage(this.catalogue.tenantIdOf(request));
  }

  @Get(':id')
  @RequirePermission(MEDIA_READERS)
  @ResponseMessage('MediaRetrieved')
  @ApiOperation({ summary: 'One item, and every place it shows (MED-09)' })
  @ZodResponse({ type: MediaDetailDto })
  get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<MediaDetail> {
    return this.media.get(
      this.catalogue.tenantIdOf(request),
      this.catalogue.idOf(id, 'MediaNotFound'),
    );
  }

  @Delete(':id')
  @RequirePermission(MEDIA_WRITERS)
  @ResponseMessage('MediaDeleted')
  @ApiOperation({
    summary:
      'Delete an item: it leaves every product, category, swatch and logo it showed on at once (MED-09, STO-07)',
  })
  @ZodResponse({ type: OkDto })
  async delete(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    const tenantId = this.catalogue.tenantIdOf(request);
    const mediaId = this.catalogue.idOf(id, 'MediaNotFound');
    const purpose = await this.media.purposeOf(tenantId, mediaId);
    await this.refuseWithout(request, MEDIA_PURPOSE_PERMISSION[purpose]);
    await this.media.delete(tenantId, mediaId, this.catalogue.actorOf(request));
    return { ok: true };
  }

  /** STF-11: what this purpose needs, beyond the route's own gate. The owner holds every permission. */
  private async refuseWithout(request: DashboardRequest, permission: Permission): Promise<void> {
    if (!(await this.catalogue.holds(request, permission))) {
      throw new ApiError('forbidden', 'PermissionDenied', { permission });
    }
  }
}
