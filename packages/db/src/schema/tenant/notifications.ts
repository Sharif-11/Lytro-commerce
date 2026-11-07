import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { NotificationKind } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { users } from './staff';

/** A notification's words in both languages: the bell shows the reader's, push and email use the one they chose. */
export interface NotificationWords {
  bn: { title: string; body: string };
  en: { title: string; body: string };
}

// NTF-01, NTF-03 (Phase 7 Slice 7.3, read agreed 2026-11-07): one row for each person a notification went to, with its
// words in both languages, where it leads in the dashboard, and when the person read it. Kept 30 days (D7-39), then the
// nightly clean-up deletes it; the order or payment it was about stays.
export const notifications = tenant.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').$type<NotificationKind>().notNull(),
    words: jsonb('words').$type<NotificationWords>().notNull(),
    // A dashboard path, such as /orders/<id>; null for a notice with nowhere to go.
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'notifications_user_fk',
    }).onDelete('cascade'),
    index('notifications_user_idx').on(t.tenantId, t.userId, t.createdAt),
    index('notifications_unread_idx')
      .on(t.tenantId, t.userId)
      .where(sql`${t.readAt} IS NULL`),
    index('notifications_created_idx').on(t.tenantId, t.createdAt),
  ],
);

export type SelectNotification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// NTF-04, D7-40: the kinds a person switched off, one row each; a kind with no row is on. Only kinds that may be
// switched off are kept.
export const notificationPreferences = tenant.table(
  'notification_preferences',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').$type<NotificationKind>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId, t.kind] }),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'notification_preferences_user_fk',
    }).onDelete('cascade'),
  ],
);

// NTF-02: each browser a person subscribed to push, with the keys its push service gave. A service that says the
// subscription is gone (404 or 410) has its row deleted; repeated failures are counted.
export const pushSubscriptions = tenant.table(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    failures: integer('failures').notNull().default(0),
    lastPushedAt: timestamp('last_pushed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'push_subscriptions_user_fk',
    }).onDelete('cascade'),
    unique('push_subscriptions_user_endpoint_key').on(t.tenantId, t.userId, t.endpoint),
  ],
);

export type SelectPushSubscription = typeof pushSubscriptions.$inferSelect;
