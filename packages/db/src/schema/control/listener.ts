import { sql } from 'drizzle-orm';
import {
  char,
  date,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  enumTuple,
  LISTENER_DEVICE_NAME_MAX_LENGTH,
  LISTENER_INSTALLATION_ID_MAX_LENGTH,
  LISTENER_SENDER_MAX_LENGTH,
  LISTENER_SHAPE_MAX_LENGTH,
  ListenerRevokeReason,
  TRANSACTION_ID_MAX_LENGTH,
  type ListenerIgnoredReason,
  type ListenerMessageStatus,
  type PaymentMethod,
  type PaymentReviewReason,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

export const listenerRevokeReason = control.enum(
  'listener_revoke_reason',
  enumTuple(Object.values(ListenerRevokeReason)),
);

// LSN-01, LSN-09, LSN-10 (Phase 5 Slice 5.4a): a code the owner makes to pair a listener phone -- single use, open
// [10] minutes, void after [10] tries. In the control schema, as API keys are, because the app pairing with it is not
// yet known to any shop; only its SHA-256 hash is kept, the code itself shown once. Purged a day after it is spent or
// runs out (LSN-05).
export const listenerPairingCodes = control.table(
  'listener_pairing_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Slice 5.6: null for Lytro's own phone, which has no shop behind it.
    tenantId: uuid('tenant_id').references(() => tenants.id),
    codeHash: char('code_hash', { length: 64 }).notNull().unique(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Paired with, or voided after too many wrong tries; either way it pairs nothing more.
    usedAt: timestamp('used_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    tries: integer('tries').notNull().default(0),
  },
  (t) => [index('listener_pairing_codes_tenant_idx').on(t.tenantId, t.createdAt)],
);

// LSN-01 to LSN-03, LSN-11, LSN-12, LSN-19 to LSN-21 (Phase 5 Slice 5.4a): a shop's paired listener phones. A device's
// token is [32] random bytes kept only as its SHA-256 hash, bound to the shop and the app installation that paired it;
// a call from another installation flags the device, and [3] flags revoke it. Revoked devices stay as history until the
// purge (LSN-05); every one goes at day 60 (LSN-23). In the control schema because the app is found by its token
// before its shop is known.
export const listenerDevices = control.table(
  'listener_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Slice 5.6: null for Lytro's own phone, which verifies what sellers pay Lytro (PAY-21).
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: varchar('name', { length: LISTENER_DEVICE_NAME_MAX_LENGTH }).notNull(),
    model: varchar('model', { length: 100 }),
    appVersion: varchar('app_version', { length: 20 }).notNull(),
    installationId: varchar('installation_id', {
      length: LISTENER_INSTALLATION_ID_MAX_LENGTH,
    }).notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    pairedBy: uuid('paired_by'),
    pairedAt: timestamp('paired_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    flags: integer('flags').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
    revokeReason: listenerRevokeReason('revoke_reason'),
    // Phase 5 Slice 5.4b: test mode's end (LSN-04); the messages it sent on its last day, Asia/Dhaka (LSN-20); and when
    // it last passed the hourly volume, so its owner and Lytro hear once (LSN-14).
    testModeUntil: timestamp('test_mode_until', { withTimezone: true }),
    uploadsDay: date('uploads_day'),
    uploadsToday: integer('uploads_today').notNull().default(0),
    volumeFlaggedAt: timestamp('volume_flagged_at', { withTimezone: true }),
  },
  (t) => [
    index('listener_devices_tenant_idx').on(t.tenantId, t.pairedAt),
    index('listener_devices_installation_idx').on(t.installationId),
    index('listener_devices_revoked_idx')
      .on(t.revokedAt)
      .where(sql`${t.revokedAt} IS NOT NULL`),
  ],
);

// LSN-21 (Phase 5 Slice 5.4a): an app installation Lytro blocked across the platform -- it pairs with no shop again,
// and its devices are revoked.
export const listenerBlockedInstallations = control.table('listener_blocked_installations', {
  installationId: varchar('installation_id', {
    length: LISTENER_INSTALLATION_ID_MAX_LENGTH,
  }).primaryKey(),
  reason: text('reason').notNull(),
  blockedBy: uuid('blocked_by'),
  blockedAt: timestamp('blocked_at', { withTimezone: true }).notNull().defaultNow(),
});

// VER-06 (amended 2026-11-02, Slice 5.4b read): the shape of what a wallet's own sender sent that the parser could not
// read -- every number and reference note removed -- with how many arrived each day, across every shop, so Lytro can
// mend the parser when a wallet changes its wording. It names no shop. Removed at [90] days.
export const listenerUnreadShapes = control.table(
  'listener_unread_shapes',
  {
    day: date('day').notNull(),
    shapeHash: char('shape_hash', { length: 64 }).notNull(),
    shape: varchar('shape', { length: LISTENER_SHAPE_MAX_LENGTH }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ name: 'listener_unread_shapes_pkey', columns: [t.day, t.shapeHash] })],
);

// PAY-21, D5-3 (Phase 5 Slice 5.6, read agreed 2026-11-03): what Lytro's own listener phones forwarded -- sellers' money for
// plans, add-ons and top-ups. It works as tenant.listener_messages does for a shop: a receipt keeps its text until it is
// redacted at [90] days, a message that verifies nothing never keeps any, one row holds each transaction ID. In control, as
// control.plan_payments is, since no shop owns it.
export const lytroListenerMessages = control.table(
  'lytro_listener_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id').notNull(),
    sender: varchar('sender', { length: LISTENER_SENDER_MAX_LENGTH }).notNull(),
    method: text('method').$type<PaymentMethod>(),
    transactionId: varchar('transaction_id', { length: TRANSACTION_ID_MAX_LENGTH }),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    senderNumber: varchar('sender_number', { length: 11 }),
    rawText: text('raw_text'),
    status: text('status').$type<ListenerMessageStatus>().notNull(),
    ignoredReason: text('ignored_reason').$type<ListenerIgnoredReason>(),
    reviewReason: text('review_reason').$type<PaymentReviewReason>(),
    // The seller's payment it claims or settled.
    planPaymentId: uuid('plan_payment_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lytro_listener_messages_holder_key')
      .on(t.transactionId)
      .where(sql`${t.status} IN ('matched', 'unmatched', 'needs_review')`),
    uniqueIndex('lytro_listener_messages_phone_key')
      .on(t.deviceId, t.transactionId)
      .where(sql`${t.status} <> 'ignored'`),
    index('lytro_listener_messages_device_idx').on(t.deviceId, t.receivedAt),
    index('lytro_listener_messages_status_idx').on(t.status, t.receivedAt),
    index('lytro_listener_messages_text_idx')
      .on(t.receivedAt)
      .where(sql`${t.rawText} IS NOT NULL`),
  ],
);

export type SelectLytroListenerMessage = typeof lytroListenerMessages.$inferSelect;
export type SelectListenerUnreadShape = typeof listenerUnreadShapes.$inferSelect;
export type SelectListenerPairingCode = typeof listenerPairingCodes.$inferSelect;
export type SelectListenerDevice = typeof listenerDevices.$inferSelect;
