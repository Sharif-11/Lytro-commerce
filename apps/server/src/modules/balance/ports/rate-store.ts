import type { Transaction } from '@lytronix/db';
import type { RateKey } from '@lytronix/validators';
import type { RateHistoryEntry, RateValue } from '../types/rate';

/** control.rates / control.rate_history. Platform-wide, no tenant context needed. */
export interface RateStore {
  /**
   * ADM-08: a change and its platform audit entry in one transaction, so a committed change always has its entry
   * and a rolled-back one never does.
   */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  get(key: RateKey): Promise<RateValue | null>;
  list(): Promise<RateValue[]>;
  /** RAT-02: writes the new value and appends a history row together, inside the change's transaction. */
  set(
    tx: Transaction,
    key: RateKey,
    oldValue: string | null,
    newValue: string,
    changedBy: string | null,
    noticeId: string | null,
  ): Promise<void>;
  history(key: RateKey): Promise<RateHistoryEntry[]>;
}
