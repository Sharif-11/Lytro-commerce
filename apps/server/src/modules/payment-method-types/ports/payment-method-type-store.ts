import type { PaymentMethodTypePatch, SelectPaymentMethodType, Transaction } from '@lytronix/db';
import type { AccountMethod, RetireState } from '@lytronix/validators';

/** WAL-18 (Phase 8 Slice 8.7): each payment method type's platform-wide state, read before any tenant context exists. */
export interface PaymentMethodTypeStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Every type that has ever been retired; one with no row is active. */
  all(): Promise<SelectPaymentMethodType[]>;
  /** Read shared in the caller's transaction, so removal waits for it (D8-67). */
  sharedState(tx: Transaction, method: AccountMethod): Promise<RetireState>;
  /** Held until the transaction ends; made first if missing. */
  lock(tx: Transaction, method: AccountMethod): Promise<SelectPaymentMethodType>;
  save(
    tx: Transaction,
    method: AccountMethod,
    patch: PaymentMethodTypePatch,
    now: Date,
  ): Promise<SelectPaymentMethodType>;
}
