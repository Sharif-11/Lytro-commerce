import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission, TenantState, type Language, type NoticesQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { headerValue } from '../../../common/http';
import { resolveLanguage } from '../../../common/i18n/accept-language';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { NoticeBoard } from '../../notices/services/notice-board';
import type {
  DashboardNoticeSummary,
  NoticeBoardPage,
  NoticeView,
  NoticeViewer,
} from '../../notices/types/notice';
import { DegradedMode } from '../../degraded-mode/services/degraded-mode';
import { PrimaryWatch } from '../../../database/primary-watch';
import { Notifications } from '../../notifications/services/notifications';
import {
  NoticeAcknowledgedDto,
  NoticeBoardPageDto,
  NoticeSummaryDto,
  NoticesQueryDto,
  NoticeUnreadDto,
  NoticeViewDto,
} from '../dto/notices.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

/** NTC-07: an archived shop -- or a deleted one its owner can still reach -- sees urgent notices only. */
const URGENT_ONLY: ReadonlySet<TenantState> = new Set([TenantState.Archived, TenantState.Deleted]);

// NTC-02 to NTC-05, NTC-07, NTC-10, NTC-15 (Phase 7 Slice 7.4, read agreed 2026-11-07): a shop's notice board, for the
// owner and the staff who hold `notices:read`. The owner still reads it when the shop is read-only, locked or archived
// (NTC-07; staff are kept out once it is locked), and reading, closing a banner and "I understand" still work in
// read-only. Nothing here writes a notice: that is the operator's alone (NTC-10).
@ApiTags('Notices')
@Controller('notices')
@Dashboard({ lapsed: true, readOnlyWrite: true })
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class NoticesController {
  constructor(
    @Inject(NoticeBoard) private readonly board: NoticeBoard,
    @Inject(Notifications) private readonly notifications: Notifications,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
    @Inject(DegradedMode) private readonly degraded: Pick<DegradedMode, 'on'>,
    @Inject(PrimaryWatch) private readonly watch: Pick<PrimaryWatch, 'canSave'>,
  ) {}

  @Get()
  @RequirePermission(Permission.NoticesRead)
  @ResponseMessage('NoticesListed')
  @ApiOperation({
    summary:
      "The shop's notice board: pinned first, then newest, by category or words, in the reader's language, with the badge's count (NTC-03)",
  })
  @ZodResponse({ type: NoticeBoardPageDto })
  async list(
    @Query(new ZodValidationPipe(NoticesQueryDto.schema)) query: NoticesQuery,
    @Req() request: DashboardRequest,
  ): Promise<NoticeBoardPage> {
    const { viewer } = await this.viewer(request);
    return this.board.list(viewer, query, this.language(request));
  }

  @Get('summary')
  @RequirePermission(Permission.NoticesRead)
  @ResponseMessage('NoticeSummaryRead')
  @ApiOperation({
    summary:
      'What every dashboard page shows of the notices: the badge, urgent banners, important prompts, what the owner must acknowledge, the next maintenance window (NTC-03, NTC-04, NTC-05, NTC-14)',
  })
  @ZodResponse({ type: NoticeSummaryDto })
  async summary(@Req() request: DashboardRequest): Promise<DashboardNoticeSummary> {
    const { viewer, owner } = await this.viewer(request);
    // Slice 9.9: every page polls this, so it also carries the two states the dashboard's banners show.
    const [summary, limitedMode] = await Promise.all([
      this.board.summary(viewer, this.language(request), owner),
      this.degraded.on(),
    ]);
    return { ...summary, limitedMode, savingPaused: !this.watch.canSave() };
  }

  @Get(':id')
  @RequirePermission(Permission.NoticesRead)
  @ResponseMessage('NoticeShown')
  @ApiOperation({ summary: "One notice on the shop's board, in the reader's language (NTC-15)" })
  @ZodResponse({ type: NoticeViewDto })
  async one(@Param('id') id: string, @Req() request: DashboardRequest): Promise<NoticeView> {
    const { viewer } = await this.viewer(request);
    return this.board.one(viewer, this.request.idOf(id, 'NoticeNotFound'), this.language(request));
  }

  @Post(':id/read')
  @HttpCode(200)
  @RequirePermission(Permission.NoticesRead)
  @ResponseMessage('NoticeMarkedRead')
  @ApiOperation({ summary: 'The signed-in person opened the notice (NTC-09)' })
  @ZodResponse({ type: NoticeUnreadDto })
  async read(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<{ unread: number }> {
    const { viewer } = await this.viewer(request);
    return this.board.markRead(viewer, this.request.idOf(id, 'NoticeNotFound'));
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  @RequirePermission(Permission.NoticesRead)
  @ResponseMessage('NoticeDismissed')
  @ApiOperation({
    summary: "The signed-in person closed the notice's urgent banner or important prompt (NTC-04)",
  })
  @ZodResponse({ type: OkDto })
  async dismiss(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    const { viewer } = await this.viewer(request);
    await this.board.dismiss(viewer, this.request.idOf(id, 'NoticeNotFound'));
    return { ok: true };
  }

  @Post(':id/acknowledge')
  @HttpCode(200)
  @RequirePermission(Permission.NoticesRead)
  @ResponseMessage('NoticeAcknowledged')
  @ApiOperation({
    summary:
      'The owner\'s "I understand", once for the shop, written to its activity log and to Lytro\'s (NTC-05, NTC-17)',
  })
  @ZodResponse({ type: NoticeAcknowledgedDto })
  async acknowledge(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<{ acknowledgedAt: Date }> {
    const { viewer, owner } = await this.viewer(request);
    if (!owner) throw new ApiError('forbidden', 'OwnerOnlyAction', {});
    return this.board.acknowledge(
      viewer,
      this.request.idOf(id, 'NoticeNotFound'),
      this.request.actorOf(request).ip,
    );
  }

  /** Who is reading: the shop as its audience reads it, the person's own row, and whether they are its owner. */
  private async viewer(
    request: DashboardRequest,
  ): Promise<{ viewer: NoticeViewer; owner: boolean }> {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    const sessionUserId = request.session?.userId ?? null;
    const userId = await this.notifications.viewerId(tenant.id, sessionUserId);
    if (userId === null) throw new ApiError('not_found', 'PageNotFound', {});
    return {
      viewer: {
        tenantId: tenant.id,
        userId,
        planId: tenant.planId,
        state: tenant.state,
        urgentOnly: URGENT_ONLY.has(tenant.state),
      },
      owner: sessionUserId === null,
    };
  }

  private language(request: DashboardRequest): Language {
    return resolveLanguage(headerValue(request.headers['accept-language']));
  }
}
