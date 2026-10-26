import type { Transaction } from '@lytronix/db';
import type { LedgerEntryType } from '@lytronix/validators';
import type { LedgerEntry } from '../types/ledger-entry';

// No balance_after: the database fills it from the balance it locks, and moves the balance with it (BAL-02).
export interface NewLedgerEntry {
  tenantId: string;
  type: LedgerEntryType;
  amount: string; // signed, never zero
  units?: string | null;
  rateUsed?: string | null;
  reference?: unknown;
}

export interface LedgerFilters {
  types?: LedgerEntryType[];
  dateFrom?: Date;
  dateTo?: Date;
}

/** Ledger rows of one tenant. Every method runs inside the caller's transaction (BAL-02). */
export interface BalanceLedgerStore {
  /** Runs the work in a transaction with the tenant context set. For a caller with no transaction open yet. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  insert(tx: Transaction, entry: NewLedgerEntry): Promise<LedgerEntry>;
  list(
    tx: Transaction,
    tenantId: string,
    filters: LedgerFilters,
    cursor: number | null,
    limit: number,
  ): Promise<LedgerEntry[]>;
  /** What the shop's entries of these types came to since `since`, signed (a charge is negative). */
  sumSince(
    tx: Transaction,
    tenantId: string,
    types: LedgerEntryType[],
    since: Date,
  ): Promise<string>;
}
