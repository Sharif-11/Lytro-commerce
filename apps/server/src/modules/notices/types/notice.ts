import type { NoticeCounts, NoticeShop, NoticeSnapshot, SelectNotice } from '@lytronix/db';
import {
  NoticeStatus,
  type Language,
  type NoticeAudience,
  type NoticeCategory,
  type NoticeSeverity,
} from '@lytronix/validators';

/** Who is looking at the board (NTC-02, NTC-07), for the routes that build it from the request. */
export type { NoticeViewer } from '@lytronix/db';

/** NTC-03, NTC-15, NTC-16: a notice on a shop's board, in the reader's language, its body as typed and as safe HTML. */
export interface NoticeView {
  id: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  title: string;
  body: string;
  html: string;
  language: Language;
  pinned: boolean;
  requiresAck: boolean;
  acknowledgedAt: Date | null;
  publishedAt: Date;
  endsAt: Date | null;
  // NTC-08: when it was last changed after going live; the board says "updated".
  editedAt: Date | null;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  read: boolean;
}

export interface NoticeBoardPage {
  items: NoticeView[];
  unread: number;
  // Where the next page starts, or null on the last.
  next: number | null;
}

/** A notice as a banner, a prompt or a reminder names it. */
export interface NoticeBrief {
  id: string;
  title: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  publishedAt: Date;
}

/** NTC-14: the maintenance window the dashboard counts down to. */
export interface NoticeCountdown {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  underWay: boolean;
}

/**
 * NTC-03, NTC-04, NTC-05, NTC-14: what every dashboard page reads -- the badge, the urgent banners until closed, the
 * important prompts until seen, what the owner must acknowledge, and the next maintenance window.
 */
export interface NoticeSummary {
  unread: number;
  banners: NoticeBrief[];
  prompts: NoticeBrief[];
  toAcknowledge: NoticeBrief[];
  maintenance: NoticeCountdown | null;
}

/** NTC-01, NTC-08, NTC-09: a notice as the operator sees it -- both languages, where it stands, what came of it. */
export interface OperatorNoticeView {
  id: string;
  titleBn: string | null;
  titleEn: string | null;
  bodyBn: string | null;
  bodyEn: string | null;
  htmlBn: string | null;
  htmlEn: string | null;
  category: NoticeCategory;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  publishAt: Date | null;
  endsAt: Date | null;
  pinned: boolean;
  requiresAck: boolean;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  rateChangeId: number | null;
  status: NoticeStatus;
  createdBy: string;
  createdAt: Date;
  editedAt: Date | null;
  withdrawnAt: Date | null;
  sentAt: Date | null;
  counts: NoticeCounts;
}

/** NTC-08: an earlier version, kept by the edit that replaced it. */
export interface NoticeVersionView {
  editedBy: string;
  replacedAt: Date;
  snapshot: NoticeSnapshot;
}

export interface OperatorNoticeDetail extends OperatorNoticeView {
  versions: NoticeVersionView[];
}

/** NTC-05: the shops that said "I understand", and those still to. */
export interface NoticeAcknowledgmentList {
  acknowledged: (NoticeShop & { userId: string; acknowledgedAt: Date })[];
  pending: NoticeShop[];
  acknowledgedCount: number;
  pendingCount: number;
}

/** NTC-08, NTC-11: where a notice stands, read from its times. */
export function noticeStatus(
  notice: Pick<SelectNotice, 'withdrawnAt' | 'publishAt' | 'endsAt'>,
  now: Date,
): NoticeStatus {
  if (notice.withdrawnAt) return NoticeStatus.Withdrawn;
  if (!notice.publishAt) return NoticeStatus.Draft;
  if (notice.publishAt > now) return NoticeStatus.Scheduled;
  if (notice.endsAt && notice.endsAt <= now) return NoticeStatus.Ended;
  return NoticeStatus.Live;
}

/** NTC-08: a notice as it stands, to keep when an edit replaces it. */
export function noticeSnapshot(notice: SelectNotice): NoticeSnapshot {
  const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);
  return {
    titleBn: notice.titleBn,
    titleEn: notice.titleEn,
    bodyBn: notice.bodyBn,
    bodyEn: notice.bodyEn,
    category: notice.category,
    severity: notice.severity,
    audience: notice.audience,
    publishAt: iso(notice.publishAt),
    endsAt: iso(notice.endsAt),
    pinned: notice.pinned,
    requiresAck: notice.requiresAck,
    windowStartsAt: iso(notice.windowStartsAt),
    windowEndsAt: iso(notice.windowEndsAt),
    rateChangeId: notice.rateChangeId,
  };
}
