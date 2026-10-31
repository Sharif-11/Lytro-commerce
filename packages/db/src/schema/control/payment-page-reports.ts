import { index, inet, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  enumTuple,
  PAGE_REPORT_NOTE_MAX_LENGTH,
  PaymentPageReportReason,
  PaymentPageReportStatus,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

export const paymentPageReportReason = control.enum(
  'payment_page_report_reason',
  enumTuple(Object.values(PaymentPageReportReason)),
);
export const paymentPageReportStatus = control.enum(
  'payment_page_report_status',
  enumTuple(Object.values(PaymentPageReportStatus)),
);

// TVR-02, ADM-12 (Phase 5 Slice 5.2b, agreed 2026-10-31): a shopper's report of a payment page, for Lytro's operator,
// who dismisses it or suspends the shop's page (TVR-03). In control, as the operator reads every shop's; goes with the
// shop's data at day 60.
export const paymentPageReports = control.table(
  'payment_page_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ref: varchar('ref', { length: 32 }).notNull(),
    reason: paymentPageReportReason('reason').notNull(),
    note: varchar('note', { length: PAGE_REPORT_NOTE_MAX_LENGTH }),
    ip: inet('ip'),
    status: paymentPageReportStatus('status').notNull().default(PaymentPageReportStatus.Open),
    handledBy: uuid('handled_by'),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('payment_page_reports_status_idx').on(t.status, t.createdAt),
    index('payment_page_reports_tenant_idx').on(t.tenantId, t.status),
    // TVR-02: a visitor's reports in the last hour, for the hourly limit.
    index('payment_page_reports_ip_idx').on(t.ip, t.createdAt),
  ],
);

export type SelectPaymentPageReport = typeof paymentPageReports.$inferSelect;
