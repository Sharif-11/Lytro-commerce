import type { NewRequestError } from '@lytronix/db';

/** D8-3 (Phase 8 Slice 8.1): where shops' server faults are kept, each on its own, outside any shop's transaction. */
export interface RequestErrorStore {
  record(row: NewRequestError): Promise<void>;
  /** Every fault kept from before `before`; returns how many went. */
  purgeBefore(before: Date): Promise<number>;
}
