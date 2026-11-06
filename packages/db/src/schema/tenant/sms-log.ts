import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  numeric,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { SmsBlockedReason, SmsLogEntryKind, SmsLogStatus } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

// SMS-07, SMS-17 (Phase 7 Slice 7.1): every SMS a shop pays for or is refused, as the shop sees it: the shop's own sign-in
// and staff reset codes, its shoppers' sign-up codes, and its SMS events (Slice 7.2). Lytro's own SMS (sign-up codes,
// the shop-ready text, notices to a lapsed shop) are never here: they're the platform's (AUTH-21). A code's body is never
// kept; an event's is, so the shop can see what its shopper was sent.
export const smsLog = tenant.table(
  'sms_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').$type<SmsLogEntryKind>().notNull(),
    // Slice 7.2: the order an SMS event was about; none for a code. Not a foreign key: the log outlives a deleted order.
    orderId: uuid('order_id'),
    body: text('body'),
    toPhone: varchar('to_phone', { length: 15 }).notNull(),
    // SMS-09: the message's length over the unit size, whatever the language.
    units: integer('units').notNull(),
    // What the balance paid. Zero when the free allowance covered it (SMS-04), or nothing was sent.
    cost: numeric('cost', { precision: 10, scale: 2 }).notNull(),
    isEssential: boolean('is_essential').notNull(),
    status: text('status').$type<SmsLogStatus>().notNull(),
    blockedReason: text('blocked_reason').$type<SmsBlockedReason>(),
    // The provider's own ID for it, kept so delivery can be looked up if the provider ever offers it (D7-15).
    providerMessageId: text('provider_message_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('sms_log_tenant_idx').on(t.tenantId, t.createdAt),
    index('sms_log_order_idx').on(t.tenantId, t.orderId),
    check('sms_log_units_check', sql`${t.units} > 0`),
    check('sms_log_cost_check', sql`${t.cost} >= 0`),
    check(
      'sms_log_status_check',
      sql`${t.status} in ('sent', 'failed', 'blocked') AND (${t.status} = 'blocked') = (${t.blockedReason} IS NOT NULL)`,
    ),
  ],
);

export type SelectSmsLog = typeof smsLog.$inferSelect;
export type InsertSmsLog = typeof smsLog.$inferInsert;
