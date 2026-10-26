import type { LedgerEntryType, RateKey } from '@lytronix/validators';

/** Mirrors `BalanceSnapshot` and `LedgerEntry` in apps/server/src/modules/balance/types/ledger-entry.ts. */
export interface BalanceSnapshot {
  amount: string;
  frozen: boolean;
  /** BAL-04: the lowest and highest top-up the platform takes now, in whole taka. */
  topUpMin: number;
  topUpMax: number;
  /** PYG-02: the pay-as-you-go fees charged since the 1st of this month, a positive amount. */
  feesThisMonth: string;
}

export interface LedgerEntry {
  id: number;
  type: LedgerEntryType;
  amount: string;
  units: string | null;
  rateUsed: string | null;
  reference: unknown;
  balanceAfter: string;
  createdAt: string;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  nextCursor: number | null;
}

/** Mirrors `RateValue` in apps/server/src/modules/balance/types/rate.ts (RAT-06). */
export interface RateValue {
  key: RateKey;
  value: string;
  effectiveFrom: string;
}

/** GET /balance/essential-sms (AUTH-21, SMS allowance against the plan). */
export interface EssentialSmsUsage {
  monthlyUsed: number;
  totalUsed: number;
  monthlyLimit: number | null;
  totalLimit: number | null;
}
