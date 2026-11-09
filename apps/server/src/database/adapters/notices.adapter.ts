import { Inject, Injectable } from '@nestjs/common';
import {
  NoticeRepository,
  TransactionRunner,
  type InsertNotice,
  type NoticeAcknowledgmentRow,
  type NoticeBoardFilter,
  type NoticeBoardRow,
  type NoticeCounts,
  type NoticeAudienceShop,
  type NoticeSnapshot,
  type NoticeViewer,
  type RateChangeRow,
  type SelectNotice,
  type SelectNoticeVersion,
  type Transaction,
} from '@lytronix/db';
import type { NoticeAudience, NoticeSeverity } from '@lytronix/validators';
import type { NoticeStore } from '../../modules/notices/ports/notice-store';
import { DatabaseService } from '../database.service';

type ReadKey = { noticeId: string; tenantId: string; userId: string };
type AudienceOf = Pick<SelectNotice, 'id' | 'audience' | 'severity'>;

/** NTC-01 to NTC-18: notices, their reads, acknowledgments and sending, through their repository. */
@Injectable()
export class DrizzleNoticeStore implements NoticeStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(NoticeRepository) private readonly notices: NoticeRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  runInShop<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  board(
    viewer: NoticeViewer,
    filter: NoticeBoardFilter,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow[]> {
    return this.notices.board(this.db, viewer, filter, now, keptSince);
  }

  asking(viewer: NoticeViewer, now: Date, keptSince: Date): Promise<NoticeBoardRow[]> {
    return this.notices.asking(this.db, viewer, now, keptSince);
  }

  unreadCount(viewer: NoticeViewer, now: Date, keptSince: Date): Promise<number> {
    return this.notices.unreadCount(this.db, viewer, now, keptSince);
  }

  findVisible(
    viewer: NoticeViewer,
    id: string,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow | null> {
    return this.notices.findVisible(this.db, viewer, id, now, keptSince);
  }

  markRead(key: ReadKey, at: Date): Promise<void> {
    return this.notices.markRead(this.db, key, at);
  }

  markDismissed(key: ReadKey, at: Date): Promise<void> {
    return this.notices.markDismissed(this.db, key, at);
  }

  acknowledge(
    tx: Transaction,
    key: ReadKey,
    at: Date,
  ): Promise<{ acknowledgedAt: Date; userId: string; created: boolean }> {
    return this.notices.acknowledge(tx, key, at);
  }

  create(tx: Transaction, row: InsertNotice): Promise<SelectNotice> {
    return this.notices.create(tx, row);
  }

  findById(id: string): Promise<SelectNotice | null> {
    return this.notices.findById(this.db, id);
  }

  lockById(tx: Transaction, id: string): Promise<SelectNotice | null> {
    return this.notices.lockById(tx, id);
  }

  update(tx: Transaction, id: string, change: Partial<InsertNotice>): Promise<SelectNotice> {
    return this.notices.update(tx, id, change);
  }

  addVersion(
    tx: Transaction,
    noticeId: string,
    snapshot: NoticeSnapshot,
    editedBy: string,
  ): Promise<void> {
    return this.notices.addVersion(tx, noticeId, snapshot, editedBy);
  }

  versions(noticeId: string): Promise<SelectNoticeVersion[]> {
    return this.notices.versions(this.db, noticeId);
  }

  operatorList(
    filter: NoticeBoardFilter,
  ): Promise<{ notice: SelectNotice; counts: NoticeCounts }[]> {
    return this.notices.operatorList(this.db, filter);
  }

  countsOf(id: string): Promise<NoticeCounts> {
    return this.notices.countsOf(this.db, id);
  }

  acknowledgments(noticeId: string, limit: number): Promise<NoticeAcknowledgmentRow[]> {
    return this.notices.acknowledgments(this.db, noticeId, limit);
  }

  audienceShops(
    notice: AudienceOf,
    without: 'delivered' | 'acknowledged' | null,
    limit: number,
  ): Promise<NoticeAudienceShop[]> {
    return this.notices.audienceShops(this.db, notice, without, limit);
  }

  audienceCount(
    notice: { id?: string; audience: NoticeAudience; severity: NoticeSeverity },
    without: 'acknowledged' | null,
  ): Promise<number> {
    return this.notices.audienceCount(this.db, notice, without);
  }

  rateChange(id: number): Promise<RateChangeRow | null> {
    return this.notices.rateChange(this.db, id);
  }

  plansExist(planIds: readonly string[]): Promise<boolean> {
    return this.notices.plansExist(this.db, planIds);
  }

  shopExists(tenantId: string): Promise<boolean> {
    return this.notices.shopExists(this.db, tenantId);
  }

  due(now: Date, limit: number): Promise<SelectNotice[]> {
    return this.notices.due(this.db, now, limit);
  }

  claimDelivery(tx: Transaction, noticeId: string, tenantId: string): Promise<boolean> {
    return this.notices.claimDelivery(tx, noticeId, tenantId);
  }

  finishDelivery(
    tx: Transaction,
    noticeId: string,
    tenantId: string,
    result: { people: number; emailed: boolean },
  ): Promise<void> {
    return this.notices.finishDelivery(tx, noticeId, tenantId, result);
  }

  markSent(id: string, at: Date): Promise<void> {
    return this.notices.markSent(this.db, id, at);
  }

  linkRateChange(rateChangeId: number, noticeId: string): Promise<void> {
    return this.notices.linkRateChange(this.db, rateChangeId, noticeId);
  }
}
