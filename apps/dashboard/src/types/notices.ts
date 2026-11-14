import type { NoticeCategory, NoticeSeverity } from '@lytronix/validators';

// Mirrors apps/server/src/modules/notices/types/notice.ts (Phase 7 Slice 7.4, NTC-01 to NTC-19). Titles and bodies come in
// the request's language, or the other when the notice has none in it (NTC-15), `language` saying which.

/** A notice on the shop's board. */
export interface NoticeView {
  id: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  title: string;
  /** As Lytro typed it, in D7-53's few marks. */
  body: string;
  /** NTC-16: the same body as safe HTML -- escaped, then bold, https links and lists only. */
  html: string;
  language: 'bn' | 'en';
  pinned: boolean;
  requiresAck: boolean;
  acknowledgedAt: string | null;
  publishedAt: string;
  endsAt: string | null;
  /** NTC-08: changed after it went live; the board says "Updated". */
  editedAt: string | null;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  read: boolean;
}

export interface NoticeBoardPage {
  items: NoticeView[];
  unread: number;
  /** Where the next page starts, or null on the last. */
  next: number | null;
}

/** A notice as a banner, a prompt or a reminder names it. */
export interface NoticeBrief {
  id: string;
  title: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  publishedAt: string;
}

/** NTC-14: the next maintenance window. */
export interface NoticeCountdown {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  underWay: boolean;
}

/** What every dashboard page reads (GET /notices/summary): the badge, the marquee, the prompt, "I understand", the band. */
export interface NoticeSummary {
  unread: number;
  banners: NoticeBrief[];
  prompts: NoticeBrief[];
  toAcknowledge: NoticeBrief[];
  maintenance: NoticeCountdown | null;
  // D9-14, DAT-38 (Slice 9.9): changes can't be saved for now, and Lytro's limited mode is on, as the server knows it
  // when the summary is read. Optional, so an older server's summary still reads.
  savingPaused?: boolean;
  limitedMode?: boolean;
}
