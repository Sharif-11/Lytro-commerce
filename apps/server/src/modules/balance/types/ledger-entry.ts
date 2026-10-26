import type { LedgerEntryType } from '@lytronix/validators';

/** One row of a tenant's statement (BAL-02, BAL-14). */
export interface LedgerEntry {
  id: number;
  type: LedgerEntryType;
  amount: string; // signed
  units: string | null;
  rateUsed: string | null;
  reference: unknown;
  balanceAfter: string;
  createdAt: Date;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  nextCursor: number | null;
}

/** BAL-01, BAL-08: what the dashboard and the charge/credit flow both need. */
/**
 * BAL-01, BAL-04: the balance as its page shows it, with the lowest and highest top-up the platform takes now, and the
 * pay-as-you-go fees charged this month (PYG-02, PYG-16).
 */
export interface BalanceView extends BalanceSnapshot {
  topUpMin: number;
  topUpMax: number;
  feesThisMonth: string;
}

export interface BalanceSnapshot {
  amount: string;
  frozen: boolean;
}
