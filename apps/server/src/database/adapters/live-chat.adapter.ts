import { Inject, Injectable } from '@nestjs/common';
import {
  ChatRepository,
  RequestErrorRepository,
  TransactionRunner,
  type ChatInboxRow,
  type ChatPerson,
  type NewChatMessage,
  type NewChatPhoto,
  type SelectChatMessage,
  type SelectChatPhoto,
  type SelectChatQuickReply,
  type SelectChatThread,
  type SelectOperatorPushSubscription,
  type Transaction,
} from '@lytronix/db';
import type { ChatReaderKind, ChatSenderKind } from '@lytronix/validators';
import type {
  ChatShopContext,
  ChatShopError,
  ChatStore,
} from '../../modules/live-chat/ports/chat-store';
import { DatabaseService } from '../database.service';

/** LIVE-CHAT-PLAN (PR 1): the live chat's rows through ChatRepository; the shop's people inside its own context. */
@Injectable()
export class DrizzleChatStore implements ChatStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(RequestErrorRepository) private readonly errors: RequestErrorRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  inShop<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  thread(tenantId: string): Promise<SelectChatThread | null> {
    return this.chats.thread(this.db, tenantId);
  }

  messages(tenantId: string, since: Date, limit: number): Promise<SelectChatMessage[]> {
    return this.chats.messages(this.db, tenantId, since, limit);
  }

  photosOf(messageIds: readonly string[]): Promise<SelectChatPhoto[]> {
    return this.chats.photosOf(this.db, messageIds);
  }

  photo(id: string): Promise<SelectChatPhoto | null> {
    return this.chats.photo(this.db, id);
  }

  insertMessage(tx: Transaction, row: NewChatMessage): Promise<SelectChatMessage> {
    return this.chats.insertMessage(tx, row);
  }

  insertPhotos(tx: Transaction, rows: readonly NewChatPhoto[]): Promise<SelectChatPhoto[]> {
    return this.chats.insertPhotos(tx, rows);
  }

  touchFromShop(
    tx: Transaction,
    tenantId: string,
    at: Date,
    kind: ChatSenderKind,
    preview: string,
    page: string | null,
  ): Promise<void> {
    return this.chats.touchFromShop(tx, tenantId, at, kind, preview, page);
  }

  touchFromLytro(tx: Transaction, tenantId: string, at: Date, preview: string): Promise<void> {
    return this.chats.touchFromLytro(tx, tenantId, at, preview);
  }

  markBusySent(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    return this.chats.markBusySent(tx, tenantId, at);
  }

  markOffHoursSent(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    return this.chats.markOffHoursSent(tx, tenantId, at);
  }

  busyDue(before: Date, limit: number): Promise<SelectChatThread[]> {
    return this.chats.busyDue(this.db, before, limit);
  }

  readAt(tenantId: string, readerKind: ChatReaderKind, readerId: string): Promise<Date | null> {
    return this.chats.readAt(this.db, tenantId, readerKind, readerId);
  }

  markRead(
    tenantId: string,
    readerKind: ChatReaderKind,
    readerId: string,
    at: Date,
  ): Promise<void> {
    return this.chats.markRead(this.db, tenantId, readerKind, readerId, at);
  }

  unreadForShopPerson(tenantId: string, userId: string, since: Date): Promise<number> {
    return this.chats.unreadForShopPerson(this.db, tenantId, userId, since);
  }

  inbox(operatorId: string, since: Date, limit: number): Promise<ChatInboxRow[]> {
    return this.chats.inbox(this.db, operatorId, since, limit);
  }

  waiting(): Promise<{ count: number; latest: { tenantId: string; shopName: string } | null }> {
    return this.chats.waiting(this.db);
  }

  deleteMessagesBefore(before: Date, limit: number): Promise<number> {
    return this.chats.deleteMessagesBefore(this.db, before, limit);
  }

  deleteThreadsBefore(before: Date): Promise<number> {
    return this.chats.deleteThreadsBefore(this.db, before);
  }

  keptPhotosBefore(before: Date, limit: number): Promise<SelectChatPhoto[]> {
    return this.chats.keptPhotosBefore(this.db, before, limit);
  }

  markPhotosRemoved(ids: readonly string[], at: Date): Promise<void> {
    return this.chats.markPhotosRemoved(this.db, ids, at);
  }

  people(tenantId: string): Promise<ChatPerson[]> {
    return this.inShop(tenantId, (tx) => this.chats.people(tx, tenantId));
  }

  person(tenantId: string, userId: string): Promise<ChatPerson | null> {
    return this.inShop(tenantId, (tx) => this.chats.person(tx, tenantId, userId));
  }

  ownerUserId(tenantId: string): Promise<string | null> {
    return this.inShop(tenantId, (tx) => this.chats.ownerUserId(tx, tenantId));
  }

  shopContext(tenantId: string): Promise<ChatShopContext | null> {
    return this.chats.shopContext(this.db, tenantId);
  }

  async recentErrors(tenantId: string, since: Date, limit: number): Promise<ChatShopError[]> {
    const rows = await this.errors.latest(this.db, tenantId, since, null, limit);
    return rows.map((row) => ({
      status: row.status,
      method: row.method,
      route: row.route,
      createdAt: row.createdAt,
    }));
  }

  featureHoldings(
    tenantId: string,
    featureKey: string,
  ): Promise<{ planFeatures: Record<string, boolean> | null; override: boolean | null } | null> {
    return this.chats.featureHoldings(this.db, tenantId, featureKey);
  }

  setFeatureOverride(
    tx: Transaction,
    tenantId: string,
    featureKey: string,
    enabled: boolean | null,
    operatorId: string,
    at: Date,
  ): Promise<void> {
    return this.chats.setFeatureOverride(tx, tenantId, featureKey, enabled, operatorId, at);
  }

  quickReplies(): Promise<SelectChatQuickReply[]> {
    return this.chats.quickReplies(this.db);
  }

  quickReplyCount(): Promise<number> {
    return this.chats.quickReplyCount(this.db);
  }

  insertQuickReply(row: {
    title: string;
    body: string;
    position: number;
  }): Promise<SelectChatQuickReply> {
    return this.chats.insertQuickReply(this.db, row);
  }

  updateQuickReply(
    id: string,
    row: { title: string; body: string },
    at: Date,
  ): Promise<SelectChatQuickReply | null> {
    return this.chats.updateQuickReply(this.db, id, row, at);
  }

  deleteQuickReply(id: string): Promise<boolean> {
    return this.chats.deleteQuickReply(this.db, id);
  }

  orderQuickReplies(ids: readonly string[]): Promise<void> {
    return this.run((tx) => this.chats.orderQuickReplies(tx, ids));
  }

  operatorSubscriptions(operatorId: string | null): Promise<SelectOperatorPushSubscription[]> {
    return this.chats.operatorSubscriptions(this.db, operatorId);
  }

  upsertOperatorSubscription(row: {
    operatorId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<void> {
    return this.chats.upsertOperatorSubscription(this.db, row);
  }

  removeOperatorSubscription(operatorId: string, endpoint: string): Promise<void> {
    return this.chats.removeOperatorSubscription(this.db, operatorId, endpoint);
  }

  operatorPushed(id: string, at: Date): Promise<void> {
    return this.chats.operatorPushed(this.db, id, at);
  }

  operatorPushFailed(id: string, remove: boolean): Promise<void> {
    return this.chats.operatorPushFailed(this.db, id, remove);
  }
}
