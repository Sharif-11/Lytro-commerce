import { Inject, Injectable } from '@nestjs/common';
import type { SmsReportRow } from '@lytronix/db';
import type {
  SmsBlockedReason,
  SmsLogEntryKind,
  SmsLogQuery,
  SmsLogStatus,
  SmsReportQuery,
} from '@lytronix/validators';
import { dhakaDate, dhakaDayStart } from '../../../common/time';
import type { SmsEventStore } from '../ports/sms-event-store';
import { SMS_EVENT_STORE, SMS_EVENTS_CLOCK } from '../tokens';
import { SMS_ESTIMATE_DAYS } from './sms-settings.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SmsReport {
  dateFrom: string;
  dateTo: string;
  days: SmsReportRow[];
}

/** SMS-17: one SMS in the shop's log, as the shop sees it. */
export interface SmsLogView {
  id: number;
  kind: SmsLogEntryKind;
  toPhone: string;
  units: number;
  cost: string;
  status: SmsLogStatus;
  blockedReason: SmsBlockedReason | null;
  orderId: string | null;
  /** Slice 7.7: the order's number, for the row's link; null for a code or a deleted order. */
  orderNumber: string | null;
  /** An SMS event's words; a code's are never kept. */
  body: string | null;
  createdAt: string;
}

/** SMS-07, SMS-14, SMS-17 (Slice 7.2): what a shop's SMS did, by day and one by one. */
@Injectable()
export class SmsHistory {
  constructor(
    @Inject(SMS_EVENT_STORE) private readonly store: SmsEventStore,
    @Inject(SMS_EVENTS_CLOCK) private readonly clock: () => Date,
  ) {}

  /** SMS-14: each day's SMS by kind -- sent, failed, blocked, units and cost -- over the period, the last 30 days by default. */
  async report(tenantId: string, query: SmsReportQuery): Promise<SmsReport> {
    const dateTo = query.dateTo ?? dhakaDate(this.clock());
    const dateFrom =
      query.dateFrom ??
      dhakaDate(new Date(dhakaDayStart(dateTo).getTime() - (SMS_ESTIMATE_DAYS - 1) * DAY_MS));
    const days = await this.store.report(
      tenantId,
      dhakaDayStart(dateFrom),
      new Date(dhakaDayStart(dateTo).getTime() + DAY_MS),
    );
    return { dateFrom, dateTo, days };
  }

  async log(tenantId: string, query: SmsLogQuery): Promise<{ sms: SmsLogView[] }> {
    const rows = await this.store.list(tenantId, {
      limit: query.limit,
      before: query.before,
      orderId: query.orderId,
    });
    return {
      sms: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        toPhone: row.toPhone,
        units: row.units,
        cost: row.cost,
        status: row.status,
        blockedReason: row.blockedReason,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
