import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { MailKind, MailStatus } from '@lytronix/validators';
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
export type InsertMailOutbox = typeof mailOutbox.$inferInsert;
export type UpdateMailOutbox = Partial<InsertMailOutbox>;
