import type {
  SelectSmsLog,
  SelectSmsSettings,
  SmsEventCounts,
  SmsLogPage,
  SmsReportRow,
  SmsSettingsChange,
  Transaction,
} from '@lytronix/db';
import type { FulfilmentType, OrderSource, SmsLogEntryKind } from '@lytronix/validators';
import type { UsageCycleTenant } from '../../sms-usage/ports/essential-sms-usage-store';

/** What an SMS event reads of its order (SMS-01, SMS-10). */
export interface SmsOrderFacts {
  id: string;
  orderNumber: string;
  trackingId: string;
  source: OrderSource;
  fulfilmentType: FulfilmentType;
  customerName: string | null;
  customerPhone: string | null;
  /** CUS-09: an order whose customer was erased has no one to send to. */
  customerErased: boolean;
  grandTotal: string;
  trackingLink: string | null;
  trackingCode: string | null;
}

/** The shop as its SMS events need it. */
export interface SmsShop {
  slug: string;
  shopName: string;
  cycle: UsageCycleTenant;
}

/** Slice 7.2: a shop's SMS settings, its SMS log and the counts its estimate is made from. */
export interface SmsEventStore {
  settings(tenantId: string): Promise<SelectSmsSettings | null>;
  changeSettings(tenantId: string, change: SmsSettingsChange): Promise<SelectSmsSettings>;
  shop(tenantId: string): Promise<SmsShop | null>;
  order(tenantId: string, orderId: string): Promise<SmsOrderFacts | null>;
  /** SMS-13: what these kinds sent since then cost, in taka. */
  spentSince(tenantId: string, kinds: readonly SmsLogEntryKind[], since: Date): Promise<string>;
  counts(tenantId: string, since: Date): Promise<SmsEventCounts>;
  report(tenantId: string, from: Date, to: Date): Promise<SmsReportRow[]>;
  /** ADM-03 (Slice 8.2): how many of the shop's SMS failed or were blocked since `since`. */
  notSentSince(tenantId: string, since: Date): Promise<{ failed: number; blocked: number }>;
  list(
    tenantId: string,
    page: SmsLogPage,
  ): Promise<(SelectSmsLog & { orderNumber: string | null })[]>;
  /** A transaction in the shop's context, for an SMS's charge. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
}
