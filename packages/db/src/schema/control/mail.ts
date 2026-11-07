import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { MailKind, MailStatus, MailSuppressionReason } from '@lytronix/validators';
import { control, createdAt } from '../shared';

// SMS-18, D6, D28: mail's own outbox, mirroring SMS's exactly. A message is recorded in the same transaction as
// the change that caused it, then sent. Delivery status lets a failed send be retried without ever failing the
// request that caused it. An OTP email's body is never stored (stays null), so a copy of this table cannot
// reveal a live code (AUTH-05).
export const mailOutbox = control.table(
  'mail_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    toEmail: text('to_email').notNull(),
    kind: text('kind').$type<MailKind>().notNull(),
    subject: text('subject'), // null for otp, same as the body
    body: text('body'), // null for otp: the code is held in memory only
    status: text('status').$type<MailStatus>().notNull().default(MailStatus.Pending),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    // D7-3 (Slice 7.3): the ID Resend gave the email it accepted, for asking after one; null for the stand-in.
    providerMessageId: text('provider_message_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('mail_outbox_created_idx').on(t.createdAt),
    index('mail_outbox_due_idx').on(t.status, t.nextAttemptAt),
    check(
      'mail_outbox_status_check',
      sql`${t.status} in (${sql.raw(
        Object.values(MailStatus)
          .map((s) => `'${s}'`)
          .join(','),
      )})`,
    ),
  ],
);

export type SelectMailOutbox = typeof mailOutbox.$inferSelect;

// NTF-06 (Slice 7.3's read, agreed 2026-11-07): the addresses Lytro no longer emails, one row each, lowercased. Resend
// says an email bounced for good or was marked as spam; the row goes when the address receives a code its owner asked
// for. A code itself is still sent, since only it can prove the address works again.
export const mailSuppressions = control.table(
  'mail_suppressions',
  {
    email: text('email').primaryKey(),
    reason: text('reason').$type<MailSuppressionReason>().notNull(),
    // What the provider said, such as the receiving server's refusal, for support. Never shown to the shop.
    detail: text('detail'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'mail_suppressions_reason_check',
      sql`${t.reason} in (${sql.raw(
        Object.values(MailSuppressionReason)
          .map((s) => `'${s}'`)
          .join(','),
      )})`,
    ),
  ],
);
export type SelectMailSuppression = typeof mailSuppressions.$inferSelect;
export type InsertMailOutbox = typeof mailOutbox.$inferInsert;
export type UpdateMailOutbox = Partial<InsertMailOutbox>;
