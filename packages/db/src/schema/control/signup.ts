import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// AUTH-05, AUTH-06, AUTH-07: one-time codes. Only a keyed hash is stored, never the code (decision: HMAC).
// Counters live in the database so the lock and resend limits survive a restart and hold across servers.
export const verificationChallenges = control.table(
  'verification_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    purpose: text('purpose').notNull().default('signup'),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0), // AUTH-06: five wrong codes lock the challenge
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // AUTH-05: five minutes
    consumedAt: timestamp('consumed_at', { withTimezone: true }), // single use
    createdAt: createdAt(),
  },
  (t) => [index('verification_challenges_phone_idx').on(t.phone, t.createdAt)],
);

// The kinds and statuses of an outbox message, defined once. The database check constraint is built from these lists.
export const SMS_KINDS = ['otp', 'shop_ready'] as const;
export type SmsKind = (typeof SMS_KINDS)[number];
export const SMS_STATUSES = ['pending', 'sending', 'sent', 'failed'] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

// SMS-18, D6: messages are recorded here, then sent. Delivery status lets a failed send be retried later without
// ever failing the request that caused it. Sign-up OTP text is never stored (body stays null), so a copy of this table
// cannot reveal a live code (AUTH-05).
export const smsOutbox = control.table(
  'sms_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    toPhone: text('to_phone').notNull(),
    kind: text('kind').$type<SmsKind>().notNull(),
    body: text('body'), // null for otp: the code is held in memory only
    status: text('status').$type<SmsStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('sms_outbox_created_idx').on(t.createdAt),
    index('sms_outbox_due_idx').on(t.status, t.nextAttemptAt),
    check(
      'sms_outbox_status_check',
      sql`${t.status} in (${sql.raw(SMS_STATUSES.map((s) => `'${s}'`).join(','))})`,
    ),
  ],
);
