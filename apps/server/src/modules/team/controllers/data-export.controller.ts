import { Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { DataExportService } from '../../data-export/services/data-export.service';
import type { DataExportRecord } from '../../data-export/types/data-export';
import { DataExportDto, DataExportListDto } from '../dto/data-export-response.dto';

// Minimal shape of the raw response object this controller writes to directly for the download route --
// narrower than importing express's own type, matching this codebase's own preference for small local
// interfaces (DashboardRequest) over a framework type.
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: Buffer): void;
}

// LIF-16/17: the owner's own export of payments and the activity log. Reachable in every non-offline state,
// including archived (lapsed: true) -- LIF-18's deletion warning promises an export, so an archived tenant
// about to lose its data at day 60 must have a working route to actually get one. Never reachable while
// suspended (no suspendedOwner: true): a suspended owner's narrow carve-out is payment-resolution only,
// never data view/export, the same line LIF-24's fix drew. Owner-only throughout -- LIF-16 says "the owner
// shall be able to export", not a staff permission, so every route rejects a staff session outright rather
// than gating on one.
@ApiTags('Data export')
@Controller('exports')
@Dashboard({ lapsed: true })
@UseGuards(SessionGuard, DashboardGuard)
export class DataExportController {
  constructor(
    @Inject(DataExportService) private readonly exports: DataExportService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post()
  @Dashboard({ lapsed: true, readOnlyWrite: true })
  @ResponseMessage('ExportRequested')
  @ApiOperation({ summary: "Request an export of the shop's own data" })
  @ZodResponse({ type: DataExportDto })
  request(@Req() request: DashboardRequest): Promise<DataExportRecord> {
    return this.exports.request(this.ownerTenantIdOf(request), this.clientIp.resolve(request));
  }

  @Get()
  @ResponseMessage('ExportsListed')
  @ApiOperation({ summary: "List the shop's own export requests" })
  @ZodResponse({ type: DataExportListDto })
  list(@Req() request: DashboardRequest): Promise<DataExportRecord[]> {
    return this.exports.list(this.ownerTenantIdOf(request));
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a ready export' })
  async download(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
    @Res() response: RawResponse,
  ): Promise<void> {
    const tenantId = this.ownerTenantIdOf(request);
    const file = await this.exports.download(tenantId, id, this.clientIp.resolve(request));
    response
      .status(200)
      .set({
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="data-export-${id}.zip"`,
        'Content-Length': String(file.fileSizeBytes),
      })
      .send(file.fileContent);
  }

  /** Every route here is owner-only (LIF-16's own wording) -- a staff session, even one with every
   * permission a role could grant, is refused before anything else runs. */
  private ownerTenantIdOf(request: DashboardRequest): string {
    if (request.session?.userId !== null) {
      throw new ApiError('forbidden', 'OwnerOnlyAction', {});
    }
    const tenant = request.tenant;
    if (!tenant) {
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }
    return tenant.id;
  }
}
