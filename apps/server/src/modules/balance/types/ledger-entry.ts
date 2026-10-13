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
export interface BalanceSnapshot {
  amount: string;
  frozen: boolean;
}
