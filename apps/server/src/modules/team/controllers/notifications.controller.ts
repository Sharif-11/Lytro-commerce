import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission, type Language } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { headerValue } from '../../../common/http';
import { resolveLanguage } from '../../../common/i18n/accept-language';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  Notifications,
  type NotificationPage,
  type NotificationSwitch,
  type NotificationViewer,
} from '../../notifications/services/notifications';
import { PushSender, type PushResult } from '../../notifications/services/push-sender';
import { NotificationSubscriptions } from '../../notifications/services/notification-subscriptions';
import { StaffService } from '../../staff/services/staff.service';
import {
  NotificationPageDto,
  NotificationPreferencesDto,
  NotificationsMarkedDto,
  NotificationsQueryDto,
  NotificationsReadDto,
  NotificationSwitchesDto,
  PushKeyDto,
  PushSubscribedDto,
  PushSubscriptionDto,
  PushTestDto,
  PushUnsubscribeDto,
} from '../dto/notifications.dto';
import { CatalogueRequest } from '../services/catalogue-request';

/** Who is looking at the bell: their row in the shop, what they hold, and the language they read in. */
class NotificationReader {
  constructor(
    private readonly notifications: Notifications,
    private readonly staff: StaffService,
    private readonly request: CatalogueRequest,
  ) {}

  async viewer(
    request: DashboardRequest,
  ): Promise<{ tenantId: string; viewer: NotificationViewer }> {
    const tenantId = this.request.tenantIdOf(request);
    const sessionUserId = request.session?.userId ?? null;
    const userId = await this.notifications.viewerId(tenantId, sessionUserId);
    if (userId === null) throw new ApiError('not_found', 'PageNotFound', {});
    const tenant = request.tenant;
    const known: readonly string[] = Object.values(Permission);
    const permissions: readonly Permission[] | 'all' =
      sessionUserId === null || !tenant
        ? 'all'
        : ((await this.staff.permissionsOf(tenant, sessionUserId)) ?? []).filter(
            (held): held is Permission => known.includes(held),
          );
    return { tenantId, viewer: { userId, permissions } };
  }

  language(request: DashboardRequest): Language {
    return resolveLanguage(headerValue(request.headers['accept-language']));
  }
}

// NTF-01, NTF-04 (Phase 7 Slice 7.3, read agreed 2026-11-07): the bell -- each person's own notifications, newest first,
// in the language they read in, and the switches for the kinds they hear. Every route is the signed-in person's own, so
// none needs a permission; an owner may still read them in a lapsed shop, where the renewal and deletion notices are.
@ApiTags('Notifications')
@Controller('notifications')
@Dashboard({ lapsed: true })
@UseGuards(SessionGuard, DashboardGuard)
export class NotificationsController {
  private readonly reader: NotificationReader;

  constructor(
    @Inject(Notifications) private readonly notifications: Notifications,
    @Inject(StaffService) staff: StaffService,
    @Inject(CatalogueRequest) request: CatalogueRequest,
  ) {
    this.reader = new NotificationReader(notifications, staff, request);
  }

  @Get()
  @ResponseMessage('NotificationsListed')
  @ApiOperation({
    summary:
      "The signed-in person's notifications, newest first, in their language, with the badge's count (NTF-01)",
  })
  @ZodResponse({ type: NotificationPageDto })
  async list(
    @Query(new ZodValidationPipe(NotificationsQueryDto.schema)) query: NotificationsQueryDto,
    @Req() request: DashboardRequest,
  ): Promise<NotificationPage> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    return this.notifications.list(tenantId, viewer.userId, query, this.reader.language(request));
  }

  @Post('read')
  @HttpCode(200)
  @ResponseMessage('NotificationsMarkedRead')
  @ApiOperation({
    summary: "Mark some of the signed-in person's notifications read, or all of them (NTF-01)",
  })
  @ApiBody({ type: NotificationsReadDto })
  @ZodResponse({ type: NotificationsMarkedDto })
  async markRead(
    @Body(new ZodValidationPipe(NotificationsReadDto.schema)) body: NotificationsReadDto,
    @Req() request: DashboardRequest,
  ): Promise<{ marked: number; unread: number }> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    return this.notifications.markRead(tenantId, viewer.userId, body);
  }

  @Get('preferences')
  @ResponseMessage('NotificationPreferencesRead')
  @ApiOperation({
    summary:
      'The kinds of notification the person hears, each on or off; money and account kinds always on (NTF-04)',
  })
  @ZodResponse({ type: NotificationSwitchesDto })
  async preferences(@Req() request: DashboardRequest): Promise<{ kinds: NotificationSwitch[] }> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    return { kinds: await this.notifications.preferences(tenantId, viewer) };
  }

  @Put('preferences')
  @ResponseMessage('NotificationPreferencesSaved')
  @ApiOperation({
    summary:
      'The whole list of kinds the person switches off; a money or account kind is refused (NTF-04, D7-40)',
  })
  @ApiBody({ type: NotificationPreferencesDto })
  @ZodResponse({ type: NotificationSwitchesDto })
  async setPreferences(
    @Body(new ZodValidationPipe(NotificationPreferencesDto.schema))
    body: NotificationPreferencesDto,
    @Req() request: DashboardRequest,
  ): Promise<{ kinds: NotificationSwitch[] }> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    return { kinds: await this.notifications.setPreferences(tenantId, viewer, body) };
  }
}

// NTF-02 (Phase 7 Slice 7.3): web push -- the key a browser subscribes with, its subscription, and the test a person
// sends themselves. Only the push services' addresses are taken (the request refuses any other).
@ApiTags('Notifications')
@Controller('push')
@Dashboard({ lapsed: true })
@UseGuards(SessionGuard, DashboardGuard)
export class PushController {
  private readonly reader: NotificationReader;

  constructor(
    @Inject(Notifications) notifications: Notifications,
    @Inject(PushSender) private readonly push: PushSender,
    @Inject(NotificationSubscriptions) private readonly subscriptions: NotificationSubscriptions,
    @Inject(StaffService) staff: StaffService,
    @Inject(CatalogueRequest) request: CatalogueRequest,
  ) {
    this.reader = new NotificationReader(notifications, staff, request);
  }

  @Get('key')
  @ResponseMessage('PushKeyRead')
  @ApiOperation({
    summary:
      "Lytro's VAPID public key, which a browser subscribes with; null when push isn't set up (NTF-02)",
  })
  @ZodResponse({ type: PushKeyDto })
  key(): { publicKey: string | null } {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscriptions')
  @HttpCode(200)
  @ResponseMessage('PushSubscribed')
  @ApiOperation({
    summary:
      "Subscribe this browser to the person's push, as PushSubscription.toJSON() gives it (NTF-02)",
  })
  @ApiBody({ type: PushSubscriptionDto })
  @ZodResponse({ type: PushSubscribedDto })
  async subscribe(
    @Body(new ZodValidationPipe(PushSubscriptionDto.schema)) body: PushSubscriptionDto,
    @Req() request: DashboardRequest,
  ): Promise<{ subscribed: boolean }> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    await this.subscriptions.subscribe(
      tenantId,
      viewer.userId,
      body,
      headerValue(request.headers['user-agent']) ?? null,
    );
    return { subscribed: true };
  }

  @Delete('subscriptions')
  @ResponseMessage('PushUnsubscribed')
  @ApiOperation({ summary: 'Stop pushing to this browser (NTF-02)' })
  @ApiBody({ type: PushUnsubscribeDto })
  @ZodResponse({ type: PushSubscribedDto })
  async unsubscribe(
    @Body(new ZodValidationPipe(PushUnsubscribeDto.schema)) body: PushUnsubscribeDto,
    @Req() request: DashboardRequest,
  ): Promise<{ subscribed: boolean }> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    await this.subscriptions.unsubscribe(tenantId, viewer.userId, body.endpoint);
    return { subscribed: false };
  }

  @Post('test')
  @HttpCode(200)
  @ResponseMessage('PushTestSent')
  @ApiOperation({
    summary: 'Send the signed-in person a test push to each browser they subscribed (NTF-02)',
  })
  @ZodResponse({ type: PushTestDto })
  async test(@Req() request: DashboardRequest): Promise<PushResult> {
    const { tenantId, viewer } = await this.reader.viewer(request);
    // In the language the person is reading in: they are looking at the screen that sends it.
    return this.push.test(tenantId, viewer.userId, this.reader.language(request));
  }
}
