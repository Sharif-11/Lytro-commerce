import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from 'drizzle-orm';
import { ChatReaderKind, ChatSenderKind, type ChatSystemKind } from '@lytronix/validators';
import type { Executor, Transaction } from '../../transactions';
import {
  chatMessages,
  chatPhotos,
  chatQuickReplies,
  chatReads,
  chatThreads,
  operatorPushSubscriptions,
  plans,
  shopFeatureOverrides,
  tenants,
  users,
  type SelectChatMessage,
  type SelectChatPhoto,
  type SelectChatQuickReply,
  type SelectChatThread,
  type SelectOperatorPushSubscription,
} from '../../schema';

/** A message to keep (LC-1, LC-6). */
export interface NewChatMessage {
  tenantId: string;
  senderKind: ChatSenderKind;
  userId?: string | null;
  operatorId?: string | null;
  senderName?: string | null;
  systemKind?: ChatSystemKind | null;
  body: string;
  page?: string | null;
}

/** A photo kept in the private bucket for one message (LC-8). */
export interface NewChatPhoto {
  tenantId: string;
  messageId: string;
  position: number;
  objectKey: string;
  contentType: string;
  bytes: number;
}

/** One shop in Lytro's inbox, newest first. */
export interface ChatInboxRow {
  tenantId: string;
  shopName: string;
  slug: string;
  planName: string | null;
  lastPreview: string;
  lastSenderKind: ChatSenderKind;
  lastMessageAt: Date;
  waitingSince: Date | null;
  unread: number;
}

/** One of the shop's people, as the chat names them (LC-6). */
export interface ChatPerson {
  id: string;
  name: string | null;
  phone: string | null;
  isOwner: boolean;
}

const FROM_LYTRO = [ChatSenderKind.Lytro, ChatSenderKind.System];

// LIVE-CHAT-PLAN (the owner, 2026-11-27): the live chat's rows -- threads, messages, photos, read marks, Lytro's quick
// replies, a shop's own feature switches and Lytro's own push subscriptions. Every shop-side read names the shop.
export class ChatRepository {
  async thread(db: Executor, tenantId: string): Promise<SelectChatThread | null> {
    const [row] = await db.select().from(chatThreads).where(eq(chatThreads.tenantId, tenantId));
    return row ?? null;
  }

  /** The shop's messages since `since`, oldest first, at most `limit` (the newest when more). */
  async messages(
    db: Executor,
    tenantId: string,
    since: Date,
    limit: number,
  ): Promise<SelectChatMessage[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.tenantId, tenantId), gt(chatMessages.createdAt, since)))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  async photosOf(db: Executor, messageIds: readonly string[]): Promise<SelectChatPhoto[]> {
    if (messageIds.length === 0) return [];
    return db
      .select()
      .from(chatPhotos)
      .where(inArray(chatPhotos.messageId, [...messageIds]))
      .orderBy(asc(chatPhotos.position));
  }

  async photo(db: Executor, id: string): Promise<SelectChatPhoto | null> {
    const [row] = await db.select().from(chatPhotos).where(eq(chatPhotos.id, id));
    return row ?? null;
  }

  async insertMessage(tx: Transaction, row: NewChatMessage): Promise<SelectChatMessage> {
    const [kept] = await tx.insert(chatMessages).values(row).returning();
    if (!kept) throw new Error('chat message not kept');
    return kept;
  }

  async insertPhotos(tx: Transaction, rows: readonly NewChatPhoto[]): Promise<SelectChatPhoto[]> {
    if (rows.length === 0) return [];
    return tx
      .insert(chatPhotos)
      .values([...rows])
      .returning();
  }

  /** A shop person wrote: the thread now waits for Lytro, from its oldest unanswered message (LC-5). */
  async touchFromShop(
    tx: Transaction,
    tenantId: string,
    at: Date,
    kind: ChatSenderKind,
    preview: string,
    page: string | null,
  ): Promise<void> {
    await tx
      .insert(chatThreads)
      .values({
        tenantId,
        lastMessageAt: at,
        lastSenderKind: kind,
        lastPreview: preview,
        waitingSince: at,
        lastPage: page,
      })
      .onConflictDoUpdate({
        target: chatThreads.tenantId,
        set: {
          lastMessageAt: at,
          lastSenderKind: kind,
          lastPreview: preview,
          waitingSince: sql`coalesce(${chatThreads.waitingSince}, ${at.toISOString()}::timestamptz)`,
          lastPage: page ?? sql`${chatThreads.lastPage}`,
        },
      });
  }

  /** Lytro answered: nothing waits, and the next waiting stretch gets its own busy line. */
  async touchFromLytro(
    tx: Transaction,
    tenantId: string,
    at: Date,
    preview: string,
  ): Promise<void> {
    await tx
      .insert(chatThreads)
      .values({
        tenantId,
        lastMessageAt: at,
        lastSenderKind: ChatSenderKind.Lytro,
        lastPreview: preview,
      })
      .onConflictDoUpdate({
        target: chatThreads.tenantId,
        set: {
          lastMessageAt: at,
          lastSenderKind: ChatSenderKind.Lytro,
          lastPreview: preview,
          waitingSince: null,
          busySentAt: null,
          offHoursSentAt: null,
        },
      });
  }

  /** LC-5: the busy line went out for this waiting stretch. */
  async markBusySent(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    await tx.update(chatThreads).set({ busySentAt: at }).where(eq(chatThreads.tenantId, tenantId));
  }

  /** LC-24: the outside-hours line went out for this closed stretch. */
  async markOffHoursSent(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    await tx
      .update(chatThreads)
      .set({ offHoursSentAt: at })
      .where(eq(chatThreads.tenantId, tenantId));
  }

  /** LC-5: the chats that have waited since `before` with no busy line yet, oldest first. */
  async busyDue(db: Executor, before: Date, limit: number): Promise<SelectChatThread[]> {
    return db
      .select()
      .from(chatThreads)
      .where(and(lte(chatThreads.waitingSince, before), isNull(chatThreads.busySentAt)))
      .orderBy(asc(chatThreads.waitingSince))
      .limit(limit);
  }

  async readAt(
    db: Executor,
    tenantId: string,
    readerKind: ChatReaderKind,
    readerId: string,
  ): Promise<Date | null> {
    const [row] = await db
      .select({ readAt: chatReads.readAt })
      .from(chatReads)
      .where(
        and(
          eq(chatReads.tenantId, tenantId),
          eq(chatReads.readerKind, readerKind),
          eq(chatReads.readerId, readerId),
        ),
      );
    return row?.readAt ?? null;
  }

  async markRead(
    db: Executor,
    tenantId: string,
    readerKind: ChatReaderKind,
    readerId: string,
    at: Date,
  ): Promise<void> {
    await db
      .insert(chatReads)
      .values({ tenantId, readerKind, readerId, readAt: at })
      .onConflictDoUpdate({
        target: [chatReads.tenantId, chatReads.readerKind, chatReads.readerId],
        set: { readAt: sql`greatest(${chatReads.readAt}, excluded.read_at)` },
      });
  }

  /** LC-13: Lytro's messages (and its automatic lines) a shop person hasn't read, within the kept days. */
  async unreadForShopPerson(
    db: Executor,
    tenantId: string,
    userId: string,
    since: Date,
  ): Promise<number> {
    const read = await this.readAt(db, tenantId, ChatReaderKind.Shop, userId);
    const after = read !== null && read > since ? read : since;
    const [row] = await db
      .select({ value: count() })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.tenantId, tenantId),
          inArray(chatMessages.senderKind, FROM_LYTRO),
          gt(chatMessages.createdAt, after),
        ),
      );
    return row?.value ?? 0;
  }

  /** Lytro's inbox: every shop with a chat in the kept days, newest first, with this operator's unread count. */
  async inbox(
    db: Executor,
    operatorId: string,
    since: Date,
    limit: number,
  ): Promise<ChatInboxRow[]> {
    const unread = sql<number>`(
      select count(*)::int from ${chatMessages} m
      where m.tenant_id = ${chatThreads.tenantId}
        and m.sender_kind in ('owner', 'staff')
        and m.created_at > greatest(${since.toISOString()}::timestamptz, coalesce((
          select r.read_at from ${chatReads} r
          where r.tenant_id = ${chatThreads.tenantId} and r.reader_kind = 'lytro' and r.reader_id = ${operatorId}
        ), 'epoch'::timestamptz))
    )`;
    const rows = await db
      .select({
        tenantId: chatThreads.tenantId,
        shopName: tenants.shopName,
        slug: tenants.slug,
        planName: plans.name,
        lastPreview: chatThreads.lastPreview,
        lastSenderKind: chatThreads.lastSenderKind,
        lastMessageAt: chatThreads.lastMessageAt,
        waitingSince: chatThreads.waitingSince,
        unread,
      })
      .from(chatThreads)
      .innerJoin(tenants, eq(tenants.id, chatThreads.tenantId))
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(gt(chatThreads.lastMessageAt, since))
      .orderBy(desc(chatThreads.lastMessageAt))
      .limit(limit);
    return rows;
  }

  /** The console's floating button (LC-13): chats waiting for Lytro, and the one that waited last. */
  async waiting(
    db: Executor,
  ): Promise<{ count: number; latest: { tenantId: string; shopName: string } | null }> {
    const [total] = await db
      .select({ value: count() })
      .from(chatThreads)
      .where(isNotNull(chatThreads.waitingSince));
    const [latest] = await db
      .select({ tenantId: chatThreads.tenantId, shopName: tenants.shopName })
      .from(chatThreads)
      .innerJoin(tenants, eq(tenants.id, chatThreads.tenantId))
      .where(isNotNull(chatThreads.waitingSince))
      .orderBy(desc(chatThreads.lastMessageAt))
      .limit(1);
    return { count: total?.value ?? 0, latest: latest ?? null };
  }

  /** LC-11: messages older than `before`, a batch at a time; their photos go with them (cascade). */
  async deleteMessagesBefore(db: Executor, before: Date, limit: number): Promise<number> {
    const doomed = db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(lt(chatMessages.createdAt, before))
      .limit(limit);
    const gone = await db
      .delete(chatMessages)
      .where(inArray(chatMessages.id, doomed))
      .returning({ id: chatMessages.id });
    return gone.length;
  }

  /** LC-8: photos still stored that are older than `before`, a batch at a time. */
  async keptPhotosBefore(db: Executor, before: Date, limit: number): Promise<SelectChatPhoto[]> {
    return db
      .select()
      .from(chatPhotos)
      .where(and(isNull(chatPhotos.removedAt), lt(chatPhotos.createdAt, before)))
      .orderBy(asc(chatPhotos.createdAt))
      .limit(limit);
  }

  async markPhotosRemoved(db: Executor, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(chatPhotos)
      .set({ removedAt: at })
      .where(inArray(chatPhotos.id, [...ids]));
  }

  /** The threads whose last message is older than `before`: nothing left to show (LC-11). */
  async deleteThreadsBefore(db: Executor, before: Date): Promise<number> {
    const gone = await db
      .delete(chatThreads)
      .where(lt(chatThreads.lastMessageAt, before))
      .returning({ tenantId: chatThreads.tenantId });
    return gone.length;
  }

  /** LC-9: what Lytro's context panel shows of the shop. */
  async shopContext(
    db: Executor,
    tenantId: string,
  ): Promise<{
    tenantId: string;
    shopName: string;
    slug: string;
    state: string;
    suspended: boolean;
    planName: string | null;
    periodEnd: Date | null;
    balance: string;
  } | null> {
    const [row] = await db
      .select({
        tenantId: tenants.id,
        shopName: tenants.shopName,
        slug: tenants.slug,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        planName: plans.name,
        periodEnd: tenants.periodEnd,
        balance: tenants.balanceAmount,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, tenantId));
    if (!row) return null;
    const { suspendedAt, ...rest } = row;
    return { ...rest, suspended: suspendedAt !== null };
  }

  /** The shop's people, for the names in its chat (tenant.users; the caller has set the shop's context). */
  async people(tx: Transaction, tenantId: string): Promise<ChatPerson[]> {
    return tx
      .select({ id: users.id, name: users.name, phone: users.phone, isOwner: users.isOwner })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.active, true)))
      .orderBy(desc(users.isOwner), asc(users.name));
  }

  async person(tx: Transaction, tenantId: string, userId: string): Promise<ChatPerson | null> {
    const [row] = await tx
      .select({ id: users.id, name: users.name, phone: users.phone, isOwner: users.isOwner })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
    return row ?? null;
  }

  async ownerUserId(tx: Transaction, tenantId: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isOwner, true)))
      .limit(1);
    return row?.id ?? null;
  }

  /** LC-2: the shop's current plan's features (live, not the purchase snapshot) and its own override. */
  async featureHoldings(
    db: Executor,
    tenantId: string,
    featureKey: string,
  ): Promise<{ planFeatures: Record<string, boolean> | null; override: boolean | null } | null> {
    const [row] = await db
      .select({ features: plans.features, override: shopFeatureOverrides.enabled })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .leftJoin(
        shopFeatureOverrides,
        and(
          eq(shopFeatureOverrides.tenantId, tenants.id),
          eq(shopFeatureOverrides.featureKey, featureKey),
        ),
      )
      .where(eq(tenants.id, tenantId));
    if (!row) return null;
    return { planFeatures: row.features ?? null, override: row.override ?? null };
  }

  async setFeatureOverride(
    db: Executor,
    tenantId: string,
    featureKey: string,
    enabled: boolean | null,
    operatorId: string,
    at: Date,
  ): Promise<void> {
    if (enabled === null) {
      await db
        .delete(shopFeatureOverrides)
        .where(
          and(
            eq(shopFeatureOverrides.tenantId, tenantId),
            eq(shopFeatureOverrides.featureKey, featureKey),
          ),
        );
      return;
    }
    await db
      .insert(shopFeatureOverrides)
      .values({ tenantId, featureKey, enabled, setBy: operatorId, setAt: at })
      .onConflictDoUpdate({
        target: [shopFeatureOverrides.tenantId, shopFeatureOverrides.featureKey],
        set: { enabled, setBy: operatorId, setAt: at },
      });
  }

  async quickReplies(db: Executor): Promise<SelectChatQuickReply[]> {
    return db
      .select()
      .from(chatQuickReplies)
      .orderBy(asc(chatQuickReplies.position), asc(chatQuickReplies.createdAt));
  }

  async quickReplyCount(db: Executor): Promise<number> {
    const [row] = await db.select({ value: count() }).from(chatQuickReplies);
    return row?.value ?? 0;
  }

  async insertQuickReply(
    db: Executor,
    row: { title: string; body: string; position: number },
  ): Promise<SelectChatQuickReply> {
    const [kept] = await db.insert(chatQuickReplies).values(row).returning();
    if (!kept) throw new Error('quick reply not kept');
    return kept;
  }

  async updateQuickReply(
    db: Executor,
    id: string,
    row: { title: string; body: string },
    at: Date,
  ): Promise<SelectChatQuickReply | null> {
    const [kept] = await db
      .update(chatQuickReplies)
      .set({ ...row, updatedAt: at })
      .where(eq(chatQuickReplies.id, id))
      .returning();
    return kept ?? null;
  }

  async deleteQuickReply(db: Executor, id: string): Promise<boolean> {
    const gone = await db
      .delete(chatQuickReplies)
      .where(eq(chatQuickReplies.id, id))
      .returning({ id: chatQuickReplies.id });
    return gone.length > 0;
  }

  async orderQuickReplies(tx: Transaction, ids: readonly string[]): Promise<void> {
    for (const [position, id] of ids.entries()) {
      await tx.update(chatQuickReplies).set({ position }).where(eq(chatQuickReplies.id, id));
    }
  }

  async operatorSubscriptions(
    db: Executor,
    operatorId: string | null,
  ): Promise<SelectOperatorPushSubscription[]> {
    return db
      .select()
      .from(operatorPushSubscriptions)
      .where(
        operatorId === null ? undefined : eq(operatorPushSubscriptions.operatorId, operatorId),
      );
  }

  async upsertOperatorSubscription(
    db: Executor,
    row: { operatorId: string; endpoint: string; p256dh: string; auth: string },
  ): Promise<void> {
    await db
      .insert(operatorPushSubscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: operatorPushSubscriptions.endpoint,
        set: { operatorId: row.operatorId, p256dh: row.p256dh, auth: row.auth, failures: 0 },
      });
  }

  async removeOperatorSubscription(
    db: Executor,
    operatorId: string,
    endpoint: string,
  ): Promise<void> {
    await db
      .delete(operatorPushSubscriptions)
      .where(
        and(
          eq(operatorPushSubscriptions.operatorId, operatorId),
          eq(operatorPushSubscriptions.endpoint, endpoint),
        ),
      );
  }

  async operatorPushed(db: Executor, id: string, at: Date): Promise<void> {
    await db
      .update(operatorPushSubscriptions)
      .set({ lastPushedAt: at, failures: 0 })
      .where(eq(operatorPushSubscriptions.id, id));
  }

  async operatorPushFailed(db: Executor, id: string, remove: boolean): Promise<void> {
    if (remove) {
      await db.delete(operatorPushSubscriptions).where(eq(operatorPushSubscriptions.id, id));
      return;
    }
    await db
      .update(operatorPushSubscriptions)
      .set({ failures: sql`${operatorPushSubscriptions.failures} + 1` })
      .where(eq(operatorPushSubscriptions.id, id));
  }
}
