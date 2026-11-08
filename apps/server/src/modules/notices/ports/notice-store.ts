import type {
  InsertNotice,
  NoticeAcknowledgmentRow,
  NoticeBoardFilter,
  NoticeBoardRow,
  NoticeCounts,
  NoticeShop,
  NoticeSnapshot,
  NoticeViewer,
  RateChangeRow,
  SelectNotice,
  SelectNoticeVersion,
  Transaction,
} from '@lytronix/db';
import type { NoticeAudience, NoticeSeverity } from '@lytronix/validators';

type ReadKey = { noticeId: string; tenantId: string; userId: string };
type AudienceOf = Pick<SelectNotice, 'id' | 'audience' | 'severity'>;

/** NTC-01 to NTC-18 (Phase 7 Slice 7.4): where notices, their reads, acknowledgments and sending are kept. */
export interface NoticeStore {
  /** Platform-wide work in one transaction: a notice's writes and its audit entry. */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Work in one shop's transaction, under its row-level security: its bell rows, its activity log. */
  runInShop<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;

  board(
    viewer: NoticeViewer,
    filter: NoticeBoardFilter,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow[]>;
  asking(viewer: NoticeViewer, now: Date, keptSince: Date): Promise<NoticeBoardRow[]>;
  unreadCount(viewer: NoticeViewer, now: Date, keptSince: Date): Promise<number>;
  findVisible(
    viewer: NoticeViewer,
    id: string,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow | null>;
  markRead(key: ReadKey, at: Date): Promise<void>;
  markDismissed(key: ReadKey, at: Date): Promise<void>;
  acknowledge(
    tx: Transaction,
    key: ReadKey,
    at: Date,
  ): Promise<{ acknowledgedAt: Date; userId: string; created: boolean }>;

  create(tx: Transaction, row: InsertNotice): Promise<SelectNotice>;
  findById(id: string): Promise<SelectNotice | null>;
  lockById(tx: Transaction, id: string): Promise<SelectNotice | null>;
  update(tx: Transaction, id: string, change: Partial<InsertNotice>): Promise<SelectNotice>;
  addVersion(
    tx: Transaction,
    noticeId: string,
    snapshot: NoticeSnapshot,
    editedBy: string,
  ): Promise<void>;
  versions(noticeId: string): Promise<SelectNoticeVersion[]>;
  operatorList(
    filter: NoticeBoardFilter,
  ): Promise<{ notice: SelectNotice; counts: NoticeCounts }[]>;
  countsOf(id: string): Promise<NoticeCounts>;
  acknowledgments(noticeId: string, limit: number): Promise<NoticeAcknowledgmentRow[]>;
  audienceShops(
    notice: AudienceOf,
    without: 'delivered' | 'acknowledged' | null,
    limit: number,
  ): Promise<NoticeShop[]>;
  audienceCount(
    notice: { id?: string; audience: NoticeAudience; severity: NoticeSeverity },
    without: 'acknowledged' | null,
  ): Promise<number>;
  rateChange(id: number): Promise<RateChangeRow | null>;
  /** Whether every plan named exists. */
  plansExist(planIds: readonly string[]): Promise<boolean>;
  /** Whether the shop exists and isn't deleted. */
  shopExists(tenantId: string): Promise<boolean>;

  due(now: Date, limit: number): Promise<SelectNotice[]>;
  claimDelivery(tx: Transaction, noticeId: string, tenantId: string): Promise<boolean>;
  finishDelivery(
    tx: Transaction,
    noticeId: string,
    tenantId: string,
    result: { people: number; emailed: boolean },
  ): Promise<void>;
  markSent(id: string, at: Date): Promise<void>;
  linkRateChange(rateChangeId: number, noticeId: string): Promise<void>;
}
