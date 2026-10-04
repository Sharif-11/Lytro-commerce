import { bigserial, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

// SMS-18, D6: messages are written here and printed to the console by the stub provider.
export const smsOutbox = control.table(
  'sms_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    toPhone: text('to_phone').notNull(),
    kind: text('kind').notNull(), // otp | shop_ready
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sms_outbox_created_idx').on(t.createdAt)],
);
