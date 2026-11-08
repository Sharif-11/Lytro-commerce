import type {
  SmsBlockedReason,
  SmsEvent,
  SmsLogEntryKind,
  SmsLogStatus,
} from '@lytronix/validators';

// Mirrors GET /sms/settings, /sms/log and /sms/report (apps/server/src/modules/sms-events, Phase 7 Slices 7.1 and 7.2).

/** SMS-12: an event's estimated cost: per order before the shop has any, else a month from its last 30 days. */
export type SmsEstimate =
  { basis: 'per_order'; cost: string } | { basis: 'last_30_days'; count: number; cost: string };

export interface SmsEventSetting {
  event: SmsEvent;
  recipient: 'shopper' | 'owner';
  on: boolean;
  template: string;
  edited: boolean;
  defaultTemplate: string;
  variables: string[];
  /** SMS-10: the template as the shop's next SMS reads, with sample values, and its parts. */
  sample: string;
  units: number;
  estimate: SmsEstimate;
}

/** SMS-01's three always-on SMS, in Lytro's words, and who pays for them (Slice 7.7). */
export interface EssentialSms {
  kind: 'shopper_code' | 'staff_reset_code' | 'shop_ready';
  words: string;
  payer: 'balance' | 'free_then_balance' | 'free';
}

export interface SmsSettings {
  events: SmsEventSetting[];
  essentials: EssentialSms[];
  /** Where the owner's two SMS go (Slice 7.7); null without a phone. */
  ownerPhone?: string | null;
  smsName: string;
  usesShopName: boolean;
  shopName: string;
  monthlySpendCap: string | null;
  spentThisMonth: string;
  /** SMS-13 (Slice 7.7): the cycle the spend and its cap count over, the same one Usage reads; it starts again at the end. */
  cycleStart: string;
  cycleEnd: string;
  unitSize: number;
  rate: string;
}

/** SMS-17: one SMS in the shop's log. */
export interface SmsLogRow {
  id: number;
  kind: SmsLogEntryKind;
  toPhone: string;
  units: number;
  cost: string;
  status: SmsLogStatus;
  blockedReason: SmsBlockedReason | null;
  orderId: string | null;
  /** The order's number, for the row's link (Slice 7.7); null for a code or a deleted order. */
  orderNumber: string | null;
  /** An SMS event's words; a code's are never kept. */
  body: string | null;
  createdAt: string;
}

/** SMS-14: one day's SMS of one kind. */
export interface SmsReportRow {
  day: string;
  kind: SmsLogEntryKind;
  sent: number;
  failed: number;
  blocked: number;
  units: number;
  cost: string;
}

export interface SmsReport {
  dateFrom: string;
  dateTo: string;
  days: SmsReportRow[];
}
