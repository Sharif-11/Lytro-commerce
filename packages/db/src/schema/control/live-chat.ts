import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CHAT_BODY_MAX,
  CHAT_PAGE_MAX,
  CHAT_QUICK_REPLY_BODY_MAX,
  CHAT_QUICK_REPLY_TITLE_MAX,
  ChatReaderKind,
  ChatSenderKind,
  ChatSystemKind,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { operatorAccounts } from './operator';
import { tenants } from './tenancy';

const listOf = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(','));

// LIVE-CHAT-PLAN LC-1 to LC-13 (the owner, 2026-11-27): one chat per shop, between its owner and staff and Lytro. Lytro's
// own rows, platform-wide like the notices: every operator reads every chat, and a shop's routes always name the shop
// from the session (TEN-03). Kinds are text with a CHECK, never a database enum, so a later kind never meets a previous
// release that can't read it (migration-pr-checklist: readers before writers).

/** LC-1: a shop's one chat, as the inbox and the busy and outside-hours lines read it. */
export const chatThreads = control.table(
  'chat_threads',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    lastSenderKind: text('last_sender_kind').$type<ChatSenderKind>().notNull(),
    // The latest message's first words, for the inbox; a photo-only message has none.
    lastPreview: varchar('last_preview', { length: 120 }).notNull().default(''),
    // The shop's oldest message Lytro hasn't answered yet; null while nothing waits (LC-5, the inbox's waiting time).
    waitingSince: timestamp('waiting_since', { withTimezone: true }),
    // LC-5: the busy line, once per waiting stretch.
    busySentAt: timestamp('busy_sent_at', { withTimezone: true }),
    // LC-24: the outside-hours line, once per stretch of closed hours.
    offHoursSentAt: timestamp('off_hours_sent_at', { withTimezone: true }),
    // The dashboard page the seller was on when they last wrote, for Lytro's context panel.
    lastPage: varchar('last_page', { length: CHAT_PAGE_MAX }),
  },
  (t) => [
    index('chat_threads_waiting_idx').on(t.waitingSince),
    index('chat_threads_last_idx').on(t.lastMessageAt),
  ],
);

/** LC-1, LC-6: one message. `user_id` is the shop person (tenant.users), `operator_id` Lytro's person. */
export const chatMessages = control.table(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    senderKind: text('sender_kind').$type<ChatSenderKind>().notNull(),
    userId: uuid('user_id'),
    operatorId: uuid('operator_id').references(() => operatorAccounts.id, { onDelete: 'set null' }),
    // The person's name as it was when they wrote, so a renamed or removed staff member's message still reads right.
    senderName: varchar('sender_name', { length: 120 }),
    // LC-5, LC-24: Lytro's automatic lines carry their kind, and the dashboard writes their words.
    systemKind: text('system_kind').$type<ChatSystemKind>(),
    body: varchar('body', { length: CHAT_BODY_MAX }).notNull().default(''),
    page: varchar('page', { length: CHAT_PAGE_MAX }),
    createdAt: createdAt(),
  },
  (t) => [
    index('chat_messages_tenant_idx').on(t.tenantId, t.createdAt),
    index('chat_messages_created_idx').on(t.createdAt),
    check(
      'chat_messages_sender_kind_check',
      sql`${t.senderKind} IN (${listOf(Object.values(ChatSenderKind))})`,
    ),
    check(
      'chat_messages_system_kind_check',
      sql`${t.systemKind} IS NULL OR ${t.systemKind} IN (${listOf(Object.values(ChatSystemKind))})`,
    ),
  ],
);

/** LC-8: up to three photos a message, kept in the private bucket and deleted sooner than the message. */
export const chatPhotos = control.table(
  'chat_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    // LC-8: the photo is gone from storage; its message keeps "ছবি মুছে ফেলা হয়েছে".
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('chat_photos_message_idx').on(t.messageId),
    index('chat_photos_kept_idx')
      .on(t.createdAt)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

/** LC-13: how far each person has read a shop's chat -- each shop person, and each of Lytro's people. */
export const chatReads = control.table(
  'chat_reads',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    readerKind: text('reader_kind').$type<ChatReaderKind>().notNull(),
    readerId: uuid('reader_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.readerKind, t.readerId] }),
    check(
      'chat_reads_reader_kind_check',
      sql`${t.readerKind} IN (${listOf(Object.values(ChatReaderKind))})`,
    ),
  ],
);

/** LC-10: Lytro's own quick replies, in the order Lytro put them. */
export const chatQuickReplies = control.table('chat_quick_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: CHAT_QUICK_REPLY_TITLE_MAX }).notNull(),
  body: varchar('body', { length: CHAT_QUICK_REPLY_BODY_MAX }).notNull(),
  position: integer('position').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * LC-2: a shop's own setting for a plan feature, laid over its plan's: on or off, whatever the plan says. No row follows
 * the plan. The key is text (PLAN_FEATURES), checked by the server, so a later feature needs no migration.
 */
export const shopFeatureOverrides = control.table(
  'shop_feature_overrides',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    featureKey: varchar('feature_key', { length: 64 }).notNull(),
    enabled: boolean('enabled').notNull(),
    setBy: uuid('set_by').references(() => operatorAccounts.id, { onDelete: 'set null' }),
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.featureKey] })],
);

/** LC-4: a browser an operator turned Lytro's own notifications on in, for a chat that waits. */
export const operatorPushSubscriptions = control.table(
  'operator_push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operatorAccounts.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    failures: integer('failures').notNull().default(0),
    lastPushedAt: timestamp('last_pushed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('operator_push_subscriptions_operator_idx').on(t.operatorId)],
);

export type SelectChatThread = typeof chatThreads.$inferSelect;
export type SelectChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type SelectChatPhoto = typeof chatPhotos.$inferSelect;
export type SelectChatQuickReply = typeof chatQuickReplies.$inferSelect;
export type SelectOperatorPushSubscription = typeof operatorPushSubscriptions.$inferSelect;
