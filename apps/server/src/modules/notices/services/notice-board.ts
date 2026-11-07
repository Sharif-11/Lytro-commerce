import { Inject, Injectable } from '@nestjs/common';
import type { NoticeBoardRow, NoticeViewer } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  NOTICE_KEPT_MONTHS,
  NoticeCategory,
  NoticeSeverity,
  PlatformActorType,
  PlatformAuditAction,
  renderNoticeMarkdown,
  type Language,
  type NoticesQuery,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { addMonths } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { noticeIn } from '../notice-words';
import type { NoticeStore } from '../ports/notice-store';
import { NOTICE_STORE, NOTICES_CLOCK } from '../tokens';
import type {
  NoticeBoardPage,
  NoticeBrief,
  NoticeCountdown,
  NoticeSummary,
  NoticeView,
} from '../types/notice';

/**
 * NTC-02 to NTC-05, NTC-07, NTC-09, NTC-14, NTC-15, NTC-18 (Phase 7 Slice 7.4): a shop's board -- the notices for it
 * now, in the reader's language, each person's reads and closed banners, and the owner's "I understand". Every read
 * names the shop and the person, so nothing of another shop's ever shows.
 */
@Injectable()
export class NoticeBoard {
  constructor(
    @Inject(NOTICE_STORE) private readonly store: NoticeStore,
    @Inject(NOTICES_CLOCK) private readonly clock: () => Date,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  /** NTC-03: the months a notice stays on the board, counted on the Dhaka calendar. */
  private keptSince(now: Date): Date {
    return addMonths(now, -NOTICE_KEPT_MONTHS);
  }

  async list(
    viewer: NoticeViewer,
    query: NoticesQuery,
    language: Language,
  ): Promise<NoticeBoardPage> {
    const now = this.clock();
    const kept = this.keptSince(now);
    const [rows, unread] = await Promise.all([
      this.store.board(
        viewer,
        { category: query.category, q: query.q, limit: query.limit + 1, offset: query.offset },
        now,
        kept,
      ),
      this.store.unreadCount(viewer, now, kept),
    ]);
    return {
      items: rows.slice(0, query.limit).map((row) => this.view(row, language)),
      unread,
      next: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }

  async one(viewer: NoticeViewer, id: string, language: Language): Promise<NoticeView> {
    return this.view(await this.visible(viewer, id), language);
  }

  /** NTC-04, NTC-05, NTC-14: what every dashboard page shows of the notices. Only the owner is asked to acknowledge. */
  async summary(viewer: NoticeViewer, language: Language, owner: boolean): Promise<NoticeSummary> {
    const now = this.clock();
    const kept = this.keptSince(now);
    const [rows, unread] = await Promise.all([
      this.store.asking(viewer, now, kept),
      this.store.unreadCount(viewer, now, kept),
    ]);
    const brief = (row: NoticeBoardRow): NoticeBrief => this.brief(row, language);
    const windows = rows
      .filter(
        ({ notice }) =>
          notice.category === NoticeCategory.Maintenance &&
          notice.windowStartsAt !== null &&
          notice.windowEndsAt !== null &&
          notice.windowEndsAt > now,
      )
      .sort(
        (a, b) =>
          (a.notice.windowStartsAt?.getTime() ?? 0) - (b.notice.windowStartsAt?.getTime() ?? 0),
      );
    const next = windows[0];
    return {
      unread,
      banners: rows
        .filter((row) => row.notice.severity === NoticeSeverity.Urgent && !row.dismissedAt)
        .map(brief),
      prompts: rows
        .filter(
          (row) =>
            row.notice.severity === NoticeSeverity.Important && !row.dismissedAt && !row.readAt,
        )
        .map(brief),
      toAcknowledge: owner
        ? rows.filter((row) => row.notice.requiresAck && !row.acknowledgedAt).map(brief)
        : [],
      maintenance: next ? this.countdown(next, language, now) : null,
    };
  }

  /** NTC-09: the person opened it; the badge after. */
  async markRead(viewer: NoticeViewer, id: string): Promise<{ unread: number }> {
    await this.visible(viewer, id);
    const now = this.clock();
    await this.store.markRead(
      { noticeId: id, tenantId: viewer.tenantId, userId: viewer.userId },
      now,
    );
    return { unread: await this.store.unreadCount(viewer, now, this.keptSince(now)) };
  }

  /** NTC-04: the person closed its urgent banner or its important prompt. */
  async dismiss(viewer: NoticeViewer, id: string): Promise<void> {
    await this.visible(viewer, id);
    await this.store.markDismissed(
      { noticeId: id, tenantId: viewer.tenantId, userId: viewer.userId },
      this.clock(),
    );
  }

  /**
   * NTC-05, NTC-17: the owner's "I understand", once per shop -- recorded with who and when, written to the shop's own
   * activity log and to Lytro's, and the notice counted as read. Asked again, the first one stands.
   */
  async acknowledge(
    viewer: NoticeViewer,
    id: string,
    ip: string | null,
  ): Promise<{ acknowledgedAt: Date }> {
    const { notice } = await this.visible(viewer, id);
    if (!notice.requiresAck) throw new ApiError('conflict', 'NoticeNeedsNoAcknowledgment', {});
    const now = this.clock();
    const key = { noticeId: id, tenantId: viewer.tenantId, userId: viewer.userId };
    const acknowledged = await this.store.runInShop(viewer.tenantId, async (tx) => {
      const result = await this.store.acknowledge(tx, key, now);
      if (result.created) {
        // AUD-02: the owner's own action, so no staff member is named.
        await this.audit.record(tx, {
          tenantId: viewer.tenantId,
          actorType: ActorType.User,
          actorId: null,
          action: AuditAction.NoticeAcknowledged,
          targetType: 'notice',
          targetId: id,
          result: AuditResult.Success,
          summary: { title: notice.titleEn ?? notice.titleBn },
          ip,
        });
        await this.platformAudit.recordWithin(tx, {
          actorType: PlatformActorType.ShopOwner,
          actorId: viewer.userId,
          action: PlatformAuditAction.NoticeAcknowledged,
          targetType: 'notice',
          targetId: id,
          result: AuditResult.Success,
          ip,
          summary: { tenantId: viewer.tenantId },
        });
      }
      return result;
    });
    await this.store.markRead(key, now);
    return { acknowledgedAt: acknowledged.acknowledgedAt };
  }

  /** A notice on this shop's board now, or 404 as if it never was -- another shop's, withdrawn, ended or a draft. */
  private async visible(viewer: NoticeViewer, id: string): Promise<NoticeBoardRow> {
    const now = this.clock();
    const row = await this.store.findVisible(viewer, id, now, this.keptSince(now));
    if (!row) throw new ApiError('not_found', 'NoticeNotFound', {});
    return row;
  }

  private view(row: NoticeBoardRow, language: Language): NoticeView {
    const { notice } = row;
    const words = noticeIn(notice, language);
    return {
      id: notice.id,
      category: notice.category,
      severity: notice.severity,
      title: words.title,
      body: words.body,
      html: renderNoticeMarkdown(words.body),
      language: words.language,
      pinned: notice.pinned,
      requiresAck: notice.requiresAck,
      acknowledgedAt: row.acknowledgedAt,
      publishedAt: notice.publishAt ?? notice.createdAt,
      endsAt: notice.endsAt,
      editedAt: notice.editedAt,
      windowStartsAt: notice.windowStartsAt,
      windowEndsAt: notice.windowEndsAt,
      read: row.readAt !== null,
    };
  }

  private brief(row: NoticeBoardRow, language: Language): NoticeBrief {
    const { notice } = row;
    return {
      id: notice.id,
      title: noticeIn(notice, language).title,
      category: notice.category,
      severity: notice.severity,
      publishedAt: notice.publishAt ?? notice.createdAt,
    };
  }

  private countdown(row: NoticeBoardRow, language: Language, now: Date): NoticeCountdown | null {
    const { notice } = row;
    if (!notice.windowStartsAt || !notice.windowEndsAt) return null;
    return {
      id: notice.id,
      title: noticeIn(notice, language).title,
      startsAt: notice.windowStartsAt,
      endsAt: notice.windowEndsAt,
      underWay: notice.windowStartsAt <= now,
    };
  }
}
