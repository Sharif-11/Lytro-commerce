import type { RateKey } from '@lytronix/validators';
import type { RateHistoryEntry, RateValue } from '../types/rate';

/** control.rates / control.rate_history. Platform-wide, no transaction or tenant context needed. */
export interface RateStore {
  get(key: RateKey): Promise<RateValue | null>;
  list(): Promise<RateValue[]>;
  /** RAT-02: writes the new value and appends a history row together. */
  set(
    key: RateKey,
    oldValue: string | null,
    newValue: string,
    changedBy: string | null,
    noticeId: string | null,
  ): Promise<void>;
  history(key: RateKey): Promise<RateHistoryEntry[]>;
}
