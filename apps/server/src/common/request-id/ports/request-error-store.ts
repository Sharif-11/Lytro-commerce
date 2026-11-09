import type { NewRequestError, RequestErrorRow } from '@lytronix/db';

/** D8-3 (Phase 8 Slice 8.1): where shops' server faults are kept, each on its own, outside any shop's transaction. */
export interface RequestErrorStore {
  record(row: NewRequestError): Promise<void>;
  /** Every fault kept from before `before`; returns how many went. */
  purgeBefore(before: Date): Promise<number>;
  /** ADM-03: how many faults the shop's requests hit since `since`. */
  countSince(tenantId: string, since: Date): Promise<number>;
  /** ADM-03: the shop's faults since `since`, newest first, after `beforeId` when given. */
  latest(
    tenantId: string,
    since: Date,
    beforeId: number | null,
    limit: number,
  ): Promise<RequestErrorRow[]>;
}
