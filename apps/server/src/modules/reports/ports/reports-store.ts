import type { ReportShopRow, ShopCountRow, ShopFigure } from '@lytronix/db';
import type { LedgerEntryType, PlanPaymentKind, TenantState } from '@lytronix/validators';

/** A count on one Dhaka day. */
export interface DayCount {
  day: string;
  count: number;
}

/**
 * ADM-09, D8-9, D8-10 (Phase 8 Slice 8.4): the figures the reports read, from Lytro's own tables and the shops'
 * recorded days -- never from inside a shop's own rows. Days are Dhaka's, written YYYY-MM-DD.
 */
export interface ReportsStore {
  walletEarnedByDay(
    from: Date,
    to: Date,
  ): Promise<{ day: string; kind: PlanPaymentKind; amount: string }[]>;
  /** D8-10: what the operator recorded and reversed each day. */
  manualByDay(
    from: Date,
    to: Date,
  ): Promise<{ day: string; kind: PlanPaymentKind; reversal: boolean; amount: string }[]>;
  spendByDay(
    from: string,
    to: string,
  ): Promise<{ day: string; type: LedgerEntryType; amount: string }[]>;
  givenBackByDay(from: string, to: string): Promise<{ day: string; amount: string }[]>;
  openedByDay(from: Date, to: Date): Promise<DayCount[]>;
  firstPaidByDay(from: Date, to: Date): Promise<DayCount[]>;
  movedIntoByDay(from: string, to: string, states: readonly TenantState[]): Promise<DayCount[]>;
  countsNow(): Promise<ShopCountRow[]>;
  smsTop(from: string, to: string, limit: number): Promise<ShopFigure[]>;
  storageTop(from: string, to: string, limit: number): Promise<ShopFigure[]>;
  bandwidthTop(from: string, to: string, limit: number): Promise<ShopFigure[]>;
  shopsByIds(ids: readonly string[]): Promise<ReportShopRow[]>;
}
