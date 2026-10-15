import type { LedgerEntryType, RateKey } from '@lytronix/validators';

/** Mirrors `BalanceSnapshot` in apps/server/src/modules/balance/types/ledger-entry.ts -- see types/me.ts's
    own note on why this is a deliberate structural duplicate, not an import. */
export interface BalanceSnapshot {
  amount: string;
  frozen: boolean;
}

/** Mirrors `LedgerEntry` -- same file. */
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

/** Mirrors `RateValue` in apps/server/src/modules/balance/types/rate.ts. */
export interface RateValue {
  key: RateKey;
  value: string;
  effectiveFrom: string;
}
