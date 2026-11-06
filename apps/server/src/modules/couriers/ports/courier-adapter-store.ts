import type { CourierAdapterPatch, SelectCourierAdapter, Transaction } from '@lytronix/db';
import type { CourierKey } from '@lytronix/validators';

/** CRR-23 to CRR-25 (Phase 6 Slice 6.6): each courier's platform-wide state, read before any tenant context exists. */
export interface CourierAdapterStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Every courier that has ever been retired; one with no row is active. */
  all(): Promise<SelectCourierAdapter[]>;
  /** Held until the transaction ends; made first if missing. */
  lock(tx: Transaction, courierKey: CourierKey): Promise<SelectCourierAdapter>;
  save(
    tx: Transaction,
    courierKey: CourierKey,
    patch: CourierAdapterPatch,
    now: Date,
  ): Promise<SelectCourierAdapter>;
}
