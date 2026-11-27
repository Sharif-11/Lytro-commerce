import type {
  ChatInboxRow,
  ChatPerson,
  NewChatMessage,
  NewChatPhoto,
  SelectChatMessage,
  SelectChatPhoto,
  SelectChatQuickReply,
  SelectChatThread,
  SelectOperatorPushSubscription,
  Transaction,
} from '@lytronix/db';
import type { ChatReaderKind, ChatSenderKind } from '@lytronix/validators';

/** What Lytro's context panel shows of a shop beside its chat (LC-9). */
export interface ChatShopContext {
  tenantId: string;
  shopName: string;
  slug: string;
  state: string;
  suspended: boolean;
  planName: string | null;
  periodEnd: Date | null;
  balance: string;
}

/** A recent server fault of the shop, for the context panel (D8-3). */
export interface ChatShopError {
  status: number;
  method: string;
  route: string | null;
  createdAt: Date;
}

/**
 * LIVE-CHAT-PLAN (Slice LC, PR 1): the live chat's rows. Shop-side reads always name the shop the session names; the
 * shop's people (tenant.users) are read inside the shop's own context.
 */
export interface ChatStore {
  /** One transaction on Lytro's control rows. */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** One transaction inside the shop's own context, for its people. */
  inShop<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;

  thread(tenantId: string): Promise<SelectChatThread | null>;
  messages(tenantId: string, since: Date, limit: number): Promise<SelectChatMessage[]>;
  photosOf(messageIds: readonly string[]): Promise<SelectChatPhoto[]>;
  photo(id: string): Promise<SelectChatPhoto | null>;
  insertMessage(tx: Transaction, row: NewChatMessage): Promise<SelectChatMessage>;
  insertPhotos(tx: Transaction, rows: readonly NewChatPhoto[]): Promise<SelectChatPhoto[]>;
  touchFromShop(
    tx: Transaction,
    tenantId: string,
    at: Date,
    kind: ChatSenderKind,
    preview: string,
    page: string | null,
  ): Promise<void>;
  touchFromLytro(tx: Transaction, tenantId: string, at: Date, preview: string): Promise<void>;
  markBusySent(tx: Transaction, tenantId: string, at: Date): Promise<void>;
  markOffHoursSent(tx: Transaction, tenantId: string, at: Date): Promise<void>;
  busyDue(before: Date, limit: number): Promise<SelectChatThread[]>;
  readAt(tenantId: string, readerKind: ChatReaderKind, readerId: string): Promise<Date | null>;
  markRead(tenantId: string, readerKind: ChatReaderKind, readerId: string, at: Date): Promise<void>;
  unreadForShopPerson(tenantId: string, userId: string, since: Date): Promise<number>;
  inbox(operatorId: string, since: Date, limit: number): Promise<ChatInboxRow[]>;
  waiting(): Promise<{ count: number; latest: { tenantId: string; shopName: string } | null }>;
  deleteMessagesBefore(before: Date, limit: number): Promise<number>;
  deleteThreadsBefore(before: Date): Promise<number>;
  keptPhotosBefore(before: Date, limit: number): Promise<SelectChatPhoto[]>;
  markPhotosRemoved(ids: readonly string[], at: Date): Promise<void>;

  people(tenantId: string): Promise<ChatPerson[]>;
  person(tenantId: string, userId: string): Promise<ChatPerson | null>;
  ownerUserId(tenantId: string): Promise<string | null>;
  shopContext(tenantId: string): Promise<ChatShopContext | null>;
  recentErrors(tenantId: string, since: Date, limit: number): Promise<ChatShopError[]>;

  featureHoldings(
    tenantId: string,
    featureKey: string,
  ): Promise<{ planFeatures: Record<string, boolean> | null; override: boolean | null } | null>;
  setFeatureOverride(
    tx: Transaction,
    tenantId: string,
    featureKey: string,
    enabled: boolean | null,
    operatorId: string,
    at: Date,
  ): Promise<void>;

  quickReplies(): Promise<SelectChatQuickReply[]>;
  quickReplyCount(): Promise<number>;
  insertQuickReply(row: {
    title: string;
    body: string;
    position: number;
  }): Promise<SelectChatQuickReply>;
  updateQuickReply(
    id: string,
    row: { title: string; body: string },
    at: Date,
  ): Promise<SelectChatQuickReply | null>;
  deleteQuickReply(id: string): Promise<boolean>;
  orderQuickReplies(ids: readonly string[]): Promise<void>;

  operatorSubscriptions(operatorId: string | null): Promise<SelectOperatorPushSubscription[]>;
  upsertOperatorSubscription(row: {
    operatorId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<void>;
  removeOperatorSubscription(operatorId: string, endpoint: string): Promise<void>;
  operatorPushed(id: string, at: Date): Promise<void>;
  operatorPushFailed(id: string, remove: boolean): Promise<void>;
}
