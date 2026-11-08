import type {
  NoticeAudience,
  NoticeCategory,
  NoticeSeverity,
  NoticeStatus,
  NoticeTemplate,
} from '@lytronix/validators';

/** What came of a published notice across every shop (NTC-09). */
export interface NoticeCounts {
  shops: number;
  people: number;
  reads: number;
  acknowledged: number;
}

/** A notice as the operator's routes answer it (Slice 7.4's OperatorNoticeView). */
export interface OperatorNotice {
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
  publishAt: string | null;
  endsAt: string | null;
  pinned: boolean;
  requiresAck: boolean;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  rateChangeId: number | null;
  status: NoticeStatus;
  createdBy: string;
  createdAt: string;
  editedAt: string | null;
  withdrawnAt: string | null;
  sentAt: string | null;
  counts: NoticeCounts;
}

export interface NoticePage {
  items: OperatorNotice[];
  next: number | null;
}

/** The words and settings a version kept when an edit replaced it (NTC-08). */
export interface NoticeSnapshot {
  titleBn: string | null;
  titleEn: string | null;
  bodyBn: string | null;
  bodyEn: string | null;
  category: NoticeCategory;
  severity: NoticeSeverity;
}

export interface NoticeVersion {
  editedBy: string;
  editedByEmail: string | null;
  replacedAt: string;
  snapshot: NoticeSnapshot;
}

export interface OperatorNoticeDetail extends OperatorNotice {
  createdByEmail: string | null;
  versions: NoticeVersion[];
}

export interface NoticeShop {
  tenantId: string;
  slug: string;
  shopName: string;
}

/** NTC-05: the shops that said "I understand", and those still to. */
export interface NoticeAcknowledgments {
  acknowledged: (NoticeShop & { userId: string; acknowledgedAt: string })[];
  pending: NoticeShop[];
  acknowledgedCount: number;
  pendingCount: number;
}

/** NTC-12: a template filled in, to edit before saving. */
export interface NoticeDraft {
  titleBn: string;
  titleEn: string;
  bodyBn: string;
  bodyEn: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  requiresAck: boolean;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  rateChangeId: number | null;
}

export interface NoticeTemplateRequest {
  template: NoticeTemplate;
  variables: {
    rateChangeId?: number;
    date?: string;
    windowStartsAt?: string;
    windowEndsAt?: string;
  };
}

/** What a create or an edit sends: every field the editor holds. */
export interface NoticeWrite {
  titleBn?: string | null;
  titleEn?: string | null;
  bodyBn?: string | null;
  bodyEn?: string | null;
  category?: NoticeCategory;
  severity?: NoticeSeverity;
  audience?: NoticeAudience;
  publishAt?: string | null;
  endsAt?: string | null;
  pinned?: boolean;
  requiresAck?: boolean;
  windowStartsAt?: string | null;
  windowEndsAt?: string | null;
  rateChangeId?: number | null;
}
