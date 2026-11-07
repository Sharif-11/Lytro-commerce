import { jsonb, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { SmsEvent } from '@lytronix/validators';
import { tenant } from '../shared';

// SMS-02, SMS-10, SMS-13, SMS-16, SMS-19 (Phase 7 Slice 7.2): a shop's SMS settings, a row once the owner changes any.
// Without one, every event keeps its default (SMS-03, SMS-19), every SMS starts with the shop's own name, and there is
// no spend cap (the read, 2026-11-06).
export const smsSettings = tenant.table('sms_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  // SMS-02: only the switches the owner changed; every other event keeps its default.
  events: jsonb('events').$type<Partial<Record<SmsEvent, boolean>>>().notNull().default({}),
  // SMS-19: only the templates the owner edited. "Reset to default" takes one out, so it follows the platform's current
  // default from then on.
  templates: jsonb('templates').$type<Partial<Record<SmsEvent, string>>>().notNull().default({}),
  // SMS-16 (the read): a shorter name for every SMS to start with, null for the shop's own name.
  smsName: varchar('sms_name', { length: 60 }),
  // SMS-13: the month's most the shop's SMS events may cost, in taka; null for none.
  monthlySpendCap: numeric('monthly_spend_cap', { precision: 10, scale: 2 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectSmsSettings = typeof smsSettings.$inferSelect;
