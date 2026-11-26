import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectChatMessage, SelectChatPhoto } from '@lytronix/db';
import {
  CHAT_MESSAGES_PAGE,
  CHAT_PHOTO_MAX_BYTES,
  CHAT_QUICK_REPLIES_MAX,
  ChatReaderKind,
  ChatSenderKind,
  ChatSystemKind,
  type ChatInboxItem,
  type ChatMessageView,
  type ChatPhotoStartInput,
  type ChatQuickReplyInput,
  type ChatSendInput,
  type ChatView,
  type ChatWaitingSummary,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { StorageUnavailable } from '../../../common/errors/media-refused';
import type { MediaStorage, SignedUpload } from '../../media/ports/media-storage';
import { MEDIA_STORAGE } from '../../media/tokens';
import { evidenceTypeOf } from '../../payment-evidence/services/payment-evidence';
import type { LimitStore } from '../../shared/limits/ports/limit-store';
import { LIMIT_STORE } from '../../shared/limits/tokens';
import type { ChatShopContext, ChatShopError, ChatStore } from '../ports/chat-store';
import { CHAT_CLOCK, CHAT_STORE } from '../tokens';
import { ChatBus } from './chat-bus';
import { ChatFeature, type ChatFeatureState } from './chat-feature';
import { ChatPush, pushPreview } from './chat-push';
import { ChatSettings, openAt, type ChatRules } from './chat-settings';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const SECOND_MS = 1000;
const UPLOAD_LINK_SECONDS = 15 * 60;
const RETRY_AFTER_SECONDS = 60;
const INBOX_MAX = 200;
const BATCH = 200;
const PREVIEW_MAX = 120;
const RECENT_ERRORS = 3;
const DHAKA_OFFSET_MS = 6 * HOUR_MS;

/** A shop person in their shop's chat: the shop the session names, and their own row there (LC-6). */
export interface ChatShopPerson {
  tenantId: string;
  /** The session's own staff row; null when the person acts as the shop's owner. */
  sessionUserId: string | null;
}

/** One of Lytro's people. */
export interface ChatLytroPerson {
  operatorId: string;
  ip: string | null;
}

/** A photo as the server hands it to a reader, never a link (the private bucket). */
export interface ChatPhotoFile {
  body: Buffer;
  contentType: string;
}

/** LC-9: what Lytro sees beside a chat. */
export interface ChatLytroDetail {
  shop: ChatShopContext;
  feature: ChatFeatureState;
  messages: ChatMessageView[];
  lastPage: string | null;
  errors: ChatShopError[];
  people: { id: string; name: string | null; owner: boolean }[];
  historyDays: number;
}

/** LC-24: the most recent moment the help line closed before `at` (Dhaka hours). */
export function lastClosingBefore(at: Date, closesHour: number): Date {
  const local = new Date(at.getTime() + DHAKA_OFFSET_MS);
  const closing = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    closesHour,
  );
  const today = new Date(closing - DHAKA_OFFSET_MS);
  return today.getTime() <= at.getTime() ? today : new Date(today.getTime() - DAY_MS);
}

/**
 * LIVE-CHAT-PLAN (the owner, 2026-11-27), PR 1 without the AI: one chat per shop between its owner and staff and Lytro.
 * Writes go over HTTPS here; ChatBus tells every process with a live connection (ChatSockets) at once.
 */
@Injectable()
export class LiveChat {
  private readonly logger = new Logger('LiveChat');

  constructor(
    @Inject(CHAT_STORE) private readonly store: ChatStore,
    @Inject(CHAT_CLOCK) private readonly clock: () => Date,
    @Inject(ChatSettings) private readonly settings: Pick<ChatSettings, 'rules'>,
    @Inject(ChatFeature) private readonly feature: Pick<ChatFeature, 'state' | 'on'>,
    @Inject(ChatBus) private readonly bus: Pick<ChatBus, 'publish'>,
    @Inject(ChatPush) private readonly push: Pick<ChatPush, 'toShop' | 'toLytro'>,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(LIMIT_STORE) private readonly limits: LimitStore,
  ) {}

  // ---------- the shop's side ----------

  /** The dashboard's chat: switched on or not, the hours, and the kept days' messages. Nothing while it's off. */
  async view(person: ChatShopPerson): Promise<ChatView> {
    const [rules, on] = await Promise.all([
      this.settings.rules(),
      this.feature.on(person.tenantId),
    ]);
    const now = this.clock();
    const hours = {
      opensHour: rules.opensHour,
      closesHour: rules.closesHour,
      open: openAt(now, rules.opensHour, rules.closesHour),
    };
    if (!on) {
      return {
        enabled: false,
        messages: [],
        unread: 0,
        historyDays: rules.historyDays,
        hours,
        whatsapp: rules.whatsapp,
      };
    }
    const userId = await this.userOf(person);
    const since = this.since(rules, now);
    const [messages, unread] = await Promise.all([
      this.messagesOf(person.tenantId, since),
      this.store.unreadForShopPerson(person.tenantId, userId, since),
    ]);
    return {
      enabled: true,
      messages,
      unread,
      historyDays: rules.historyDays,
      hours,
      whatsapp: rules.whatsapp,
    };
  }

  /** LC-1, LC-6, LC-8, LC-25: a shop person writes. Outside hours, Lytro's line says when it answers (LC-24). */
  async send(person: ChatShopPerson, input: ChatSendInput): Promise<ChatMessageView> {
    await this.mustBeOn(person.tenantId);
    const rules = await this.settings.rules();
    const userId = await this.userOf(person);
    await this.admit(person.tenantId, userId, rules.messagesPerMinute);
    const who = await this.store.person(person.tenantId, userId);
    const kind = who?.isOwner ? ChatSenderKind.Owner : ChatSenderKind.Staff;
    const kept = await this.keepPhotos(
      input.photoKeys,
      `chat/${person.tenantId}/`,
      person.tenantId,
    );
    const at = this.clock();
    const preview = this.preview(input.body, kept.length);
    const { message, photos } = await this.store.run(async (tx) => {
      const row = await this.store.insertMessage(tx, {
        tenantId: person.tenantId,
        senderKind: kind,
        userId,
        senderName: who?.name ?? null,
        body: input.body,
        page: input.page ?? null,
      });
      const stored = await this.store.insertPhotos(
        tx,
        kept.map((photo, position) => ({
          ...photo,
          tenantId: person.tenantId,
          messageId: row.id,
          position,
        })),
      );
      await this.store.touchFromShop(tx, person.tenantId, at, kind, preview, input.page ?? null);
      return { message: row, photos: stored };
    });
    // Their own message counts as read by them.
    await this.store.markRead(person.tenantId, ChatReaderKind.Shop, userId, message.createdAt);
    const view = this.viewOf(message, photos);
    const shopName = (await this.store.shopContext(person.tenantId))?.shopName ?? '';
    await this.bus.publish({ type: 'message', tenantId: person.tenantId, shopName, message: view });
    if (!openAt(at, rules.opensHour, rules.closesHour)) {
      await this.offHoursLine(person.tenantId, shopName, rules, at);
    }
    await this.push.toLytro(shopName, preview, person.tenantId);
    return view;
  }

  /** LC-13: the person read the chat to now. */
  async read(person: ChatShopPerson): Promise<{ unread: number }> {
    const userId = await this.userOf(person);
    const at = this.clock();
    await this.store.markRead(person.tenantId, ChatReaderKind.Shop, userId, at);
    await this.bus.publish({
      type: 'read',
      tenantId: person.tenantId,
      readerKind: ChatReaderKind.Shop,
      readerId: userId,
    });
    return { unread: 0 };
  }

  /** LC-8: a signed link one browser may PUT one photo to, under its shop's own prefix (or Lytro's). */
  async startPhoto(
    owner: { tenantId: string } | 'lytro',
    input: ChatPhotoStartInput,
  ): Promise<{ key: string; upload: SignedUpload }> {
    if (owner !== 'lytro') await this.mustBeOn(owner.tenantId);
    const prefix = owner === 'lytro' ? 'chat/lytro/' : `chat/${owner.tenantId}/`;
    const key = `${prefix}${randomUUID()}`;
    const upload = await this.reaching(() =>
      this.storage.signUpload(key, input.contentType, input.bytes, UPLOAD_LINK_SECONDS),
    );
    return { key, upload };
  }

  /** LC-8: a photo of the shop's chat, handed by the server itself; another shop's, or a deleted one, is not found. */
  async photo(reader: { tenantId: string } | 'lytro', id: string): Promise<ChatPhotoFile> {
    const photo = await this.store.photo(id);
    if (photo === null || photo.removedAt !== null)
      throw new ApiError('not_found', 'PageNotFound', {});
    if (reader !== 'lytro' && photo.tenantId !== reader.tenantId) {
      throw new ApiError('not_found', 'PageNotFound', {});
    }
    const body = await this.reaching(() => this.storage.readEvidence(photo.objectKey));
    if (body === null) throw new ApiError('not_found', 'PageNotFound', {});
    return { body, contentType: photo.contentType };
  }

  // ---------- Lytro's side ----------

  async inbox(person: ChatLytroPerson): Promise<ChatInboxItem[]> {
    const rules = await this.settings.rules();
    const rows = await this.store.inbox(
      person.operatorId,
      this.since(rules, this.clock()),
      INBOX_MAX,
    );
    return rows.map((row) => ({
      tenantId: row.tenantId,
      shopName: row.shopName,
      slug: row.slug,
      planName: row.planName,
      lastPreview: row.lastPreview,
      lastSenderKind: row.lastSenderKind,
      lastMessageAt: row.lastMessageAt.toISOString(),
      waitingSince: row.waitingSince?.toISOString() ?? null,
      unread: row.unread,
    }));
  }

  /** LC-13: the console's floating button. */
  async waiting(): Promise<ChatWaitingSummary> {
    const waiting = await this.store.waiting();
    return {
      waiting: waiting.count,
      latestShop: waiting.latest?.shopName ?? null,
      latestTenantId: waiting.latest?.tenantId ?? null,
    };
  }

  /** LC-9: one chat with what Lytro sees beside it. */
  async detail(person: ChatLytroPerson, tenantId: string): Promise<ChatLytroDetail> {
    const shop = await this.store.shopContext(tenantId);
    if (shop === null) throw new ApiError('not_found', 'PageNotFound', {});
    const rules = await this.settings.rules();
    const now = this.clock();
    const [feature, messages, thread, errors, people] = await Promise.all([
      this.feature.state(tenantId),
      this.messagesOf(tenantId, this.since(rules, now)),
      this.store.thread(tenantId),
      this.store.recentErrors(tenantId, new Date(now.getTime() - DAY_MS), RECENT_ERRORS),
      this.store.people(tenantId),
    ]);
    return {
      shop,
      feature,
      messages,
      lastPage: thread?.lastPage ?? null,
      errors,
      people: people.map((each) => ({ id: each.id, name: each.name, owner: each.isOwner })),
      historyDays: rules.historyDays,
    };
  }

  /** LC-1: Lytro answers. A shop whose chat is off can't see it, so it's refused. */
  async reply(
    person: ChatLytroPerson,
    tenantId: string,
    input: ChatSendInput,
  ): Promise<ChatMessageView> {
    const shop = await this.store.shopContext(tenantId);
    if (shop === null) throw new ApiError('not_found', 'PageNotFound', {});
    await this.mustBeOn(tenantId);
    const kept = await this.keepPhotos(input.photoKeys, 'chat/lytro/', tenantId);
    const at = this.clock();
    const preview = this.preview(input.body, kept.length);
    const { message, photos } = await this.store.run(async (tx) => {
      const row = await this.store.insertMessage(tx, {
        tenantId,
        senderKind: ChatSenderKind.Lytro,
        operatorId: person.operatorId,
        body: input.body,
      });
      const stored = await this.store.insertPhotos(
        tx,
        kept.map((photo, position) => ({ ...photo, tenantId, messageId: row.id, position })),
      );
      await this.store.touchFromLytro(tx, tenantId, at, preview);
      return { message: row, photos: stored };
    });
    await this.store.markRead(tenantId, ChatReaderKind.Lytro, person.operatorId, message.createdAt);
    const view = this.viewOf(message, photos);
    await this.bus.publish({ type: 'message', tenantId, shopName: shop.shopName, message: view });
    await this.push.toShop(tenantId, pushPreview(input.body, photos.length));
    return view;
  }

  async lytroRead(person: ChatLytroPerson, tenantId: string): Promise<{ unread: number }> {
    if ((await this.store.shopContext(tenantId)) === null) {
      throw new ApiError('not_found', 'PageNotFound', {});
    }
    await this.store.markRead(tenantId, ChatReaderKind.Lytro, person.operatorId, this.clock());
    await this.bus.publish({
      type: 'read',
      tenantId,
      readerKind: ChatReaderKind.Lytro,
      readerId: person.operatorId,
    });
    return { unread: 0 };
  }

  // ---------- quick replies (LC-10) ----------

  async quickReplies(): Promise<{ id: string; title: string; body: string }[]> {
    const rows = await this.store.quickReplies();
    return rows.map((row) => ({ id: row.id, title: row.title, body: row.body }));
  }

  async addQuickReply(
    input: ChatQuickReplyInput,
  ): Promise<{ id: string; title: string; body: string }> {
    const count = await this.store.quickReplyCount();
    if (count >= CHAT_QUICK_REPLIES_MAX) {
      throw new ApiError('conflict', 'ChatQuickRepliesFull', { max: CHAT_QUICK_REPLIES_MAX });
    }
    const row = await this.store.insertQuickReply({ ...input, position: count });
    return { id: row.id, title: row.title, body: row.body };
  }

  async changeQuickReply(
    id: string,
    input: ChatQuickReplyInput,
  ): Promise<{ id: string; title: string; body: string }> {
    const row = await this.store.updateQuickReply(id, input, this.clock());
    if (row === null) throw new ApiError('not_found', 'PageNotFound', {});
    return { id: row.id, title: row.title, body: row.body };
  }

  async removeQuickReply(id: string): Promise<void> {
    if (!(await this.store.deleteQuickReply(id)))
      throw new ApiError('not_found', 'PageNotFound', {});
  }

  async orderQuickReplies(ids: readonly string[]): Promise<void> {
    await this.store.orderQuickReplies(ids);
  }

  // ---------- the jobs ----------

  /** LC-5: each minute, the busy line for a chat that has waited the setting's minutes within hours. */
  async tick(): Promise<number> {
    const rules = await this.settings.rules();
    const now = this.clock();
    if (!openAt(now, rules.opensHour, rules.closesHour)) return 0;
    const due = await this.store.busyDue(
      new Date(now.getTime() - rules.busyMinutes * MINUTE_MS),
      BATCH,
    );
    let sent = 0;
    for (const thread of due) {
      if (!(await this.feature.on(thread.tenantId))) continue;
      const shopName = (await this.store.shopContext(thread.tenantId))?.shopName ?? '';
      const message = await this.store.run(async (tx) => {
        const row = await this.store.insertMessage(tx, {
          tenantId: thread.tenantId,
          senderKind: ChatSenderKind.System,
          systemKind: ChatSystemKind.Busy,
          body: '',
        });
        await this.store.markBusySent(tx, thread.tenantId, now);
        return row;
      });
      await this.bus.publish({
        type: 'message',
        tenantId: thread.tenantId,
        shopName,
        message: this.viewOf(message, []),
      });
      sent += 1;
    }
    return sent;
  }

  /** LC-8, LC-11: each night, photos past their days leave storage, then messages past theirs. */
  async purge(): Promise<{ photos: number; messages: number }> {
    const rules = await this.settings.rules();
    const now = this.clock();
    const photoCutoff = new Date(now.getTime() - rules.photoDays * DAY_MS);
    const historyCutoff = this.since(rules, now);
    let photos = 0;
    for (;;) {
      const batch = await this.store.keptPhotosBefore(photoCutoff, BATCH);
      if (batch.length === 0) break;
      await this.reaching(() => this.storage.deleteEvidence(batch.map((photo) => photo.objectKey)));
      await this.store.markPhotosRemoved(
        batch.map((photo) => photo.id),
        now,
      );
      photos += batch.length;
      if (batch.length < BATCH) break;
    }
    let messages = 0;
    for (;;) {
      const removed = await this.store.deleteMessagesBefore(historyCutoff, BATCH);
      messages += removed;
      if (removed < BATCH) break;
    }
    await this.store.deleteThreadsBefore(historyCutoff);
    return { photos, messages };
  }

  // ---------- the parts ----------

  private since(rules: ChatRules, now: Date): Date {
    return new Date(now.getTime() - rules.historyDays * DAY_MS);
  }

  private async mustBeOn(tenantId: string): Promise<void> {
    if (!(await this.feature.on(tenantId)))
      throw new ApiError('plan_feature_unavailable', 'ChatOff', {});
  }

  /** The person's own row in the shop: their staff row, or the owner's row for an owner's session. */
  private async userOf(person: ChatShopPerson): Promise<string> {
    if (person.sessionUserId !== null) return person.sessionUserId;
    const owner = await this.store.ownerUserId(person.tenantId);
    if (owner === null) throw new ApiError('not_found', 'PageNotFound', {});
    return owner;
  }

  /** LC-25: messages per person per minute. */
  private async admit(tenantId: string, userId: string, perMinute: number): Promise<void> {
    const verdict = await this.limits.take(
      `chat:${tenantId}:${userId}`,
      perMinute,
      MINUTE_MS,
      this.clock(),
    );
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'TooManyChatMessages',
        {},
        Math.max(1, Math.ceil(verdict.resetMs / SECOND_MS)),
      );
    }
  }

  /** LC-24: once per closed stretch, Lytro's line saying when it answers. */
  private async offHoursLine(
    tenantId: string,
    shopName: string,
    rules: ChatRules,
    at: Date,
  ): Promise<void> {
    const thread = await this.store.thread(tenantId);
    const closedSince = lastClosingBefore(at, rules.closesHour);
    if (thread?.offHoursSentAt && thread.offHoursSentAt >= closedSince) return;
    const message = await this.store.run(async (tx) => {
      const row = await this.store.insertMessage(tx, {
        tenantId,
        senderKind: ChatSenderKind.System,
        systemKind: ChatSystemKind.OffHours,
        body: '',
      });
      await this.store.markOffHoursSent(tx, tenantId, at);
      return row;
    });
    await this.bus.publish({
      type: 'message',
      tenantId,
      shopName,
      message: this.viewOf(message, []),
    });
  }

  /** LC-8: each uploaded photo checked by its own bytes and moved to the private bucket. */
  private async keepPhotos(
    keys: readonly string[],
    prefix: string,
    tenantId: string,
  ): Promise<{ objectKey: string; contentType: string; bytes: number }[]> {
    const kept: { objectKey: string; contentType: string; bytes: number }[] = [];
    for (const key of keys) {
      if (!key.startsWith(prefix))
        throw new ApiError('validation_error', 'ChatPhotoNotUploaded', {});
      const body = await this.reaching(() => this.storage.readUpload(key));
      if (body === null) throw new ApiError('validation_error', 'ChatPhotoNotUploaded', {});
      const contentType = evidenceTypeOf(body);
      if (
        contentType === null ||
        contentType === 'application/pdf' ||
        body.length > CHAT_PHOTO_MAX_BYTES
      ) {
        throw new ApiError('validation_error', 'ChatPhotoNotAllowed', {});
      }
      // Named afresh, so a message sent again never meets its own earlier copy.
      const objectKey = `chat/${tenantId}/${randomUUID()}`;
      await this.reaching(() => this.storage.putEvidence(objectKey, body, contentType));
      kept.push({ objectKey, contentType, bytes: body.length });
      await this.reaching(() => this.storage.removeUpload(key)).catch(() => undefined);
    }
    return kept;
  }

  private async messagesOf(tenantId: string, since: Date): Promise<ChatMessageView[]> {
    const rows = await this.store.messages(tenantId, since, CHAT_MESSAGES_PAGE);
    const photos = await this.store.photosOf(rows.map((row) => row.id));
    return rows.map((row) =>
      this.viewOf(
        row,
        photos.filter((photo) => photo.messageId === row.id),
      ),
    );
  }

  private viewOf(row: SelectChatMessage, photos: readonly SelectChatPhoto[]): ChatMessageView {
    return {
      id: row.id,
      senderKind: row.senderKind,
      senderName: row.senderName,
      systemKind: row.systemKind ?? null,
      body: row.body,
      photos: photos.map((photo) => ({ id: photo.id, removed: photo.removedAt !== null })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private preview(body: string, photos: number): string {
    const text = body.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_MAX);
    return text.length > 0 ? text : photos > 0 ? '📷' : '';
  }

  /** A store that can't be reached is "try again in a minute", never a server fault. */
  private async reaching<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        this.logger.warn(`the chat's photos could not be reached: ${error.message}`);
        throw new ApiError('service_unavailable', 'StorageUnavailable', {}, RETRY_AFTER_SECONDS);
      }
      throw error;
    }
  }
}
