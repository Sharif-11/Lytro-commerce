import type { ShopDayRow } from '@lytronix/db';
import type { LedgerEntryType } from '@lytronix/validators';

/** A shop's ledger by type over a stretch: what it was charged and what entries gave back, in taka. */
export interface LedgerTotals {
  type: LedgerEntryType;
  charged: string;
  returned: string;
}

/**
 * D8-9 (Phase 8 Slice 8.4): what the night reads of each shop and writes for it. A shop's own figures are read inside
 * its row-level security, one shop at a time; the day it writes is Lytro's.
 */
export interface ShopDayStore {
  /** Every shop not deleted. */
  shopIds(): Promise<string[]>;
  /** Which of these days the shop already has recorded. */
  recorded(tenantId: string, days: readonly string[]): Promise<Set<string>>;
  record(row: ShopDayRow): Promise<void>;
  ledgerTotals(tenantId: string, from: Date, to: Date): Promise<LedgerTotals[]>;
  /** The SMS units the shop's own SMS sent between the two times. */
  smsUnits(tenantId: string, from: Date, to: Date): Promise<number>;
}
