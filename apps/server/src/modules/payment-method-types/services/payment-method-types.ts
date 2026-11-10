import { Inject, Injectable } from '@nestjs/common';
import type { PaymentMethodTypePatch, SelectPaymentMethodType, Transaction } from '@lytronix/db';
import { RetireState, type AccountMethod } from '@lytronix/validators';
import type { PaymentMethodTypeStore } from '../ports/payment-method-type-store';
import { PAYMENT_METHOD_TYPE_STORE } from '../tokens';

/** Each type's state, a type never retired being active. */
export type PaymentMethodTypeStates = ReadonlyMap<AccountMethod, SelectPaymentMethodType>;

export function stateOf(states: PaymentMethodTypeStates, method: AccountMethod): RetireState {
  return states.get(method)?.state ?? RetireState.Active;
}

/**
 * WAL-18 (Phase 8 Slice 8.7, D8-65 to D8-67): each payment method type's platform-wide state, which the shop's payment methods,
 * Lytro's own and the operator's retiring all read. A leaf, reading only the database, so each of them can import it.
 */
@Injectable()
export class PaymentMethodTypes {
  constructor(@Inject(PAYMENT_METHOD_TYPE_STORE) private readonly store: PaymentMethodTypeStore) {}

  async states(): Promise<PaymentMethodTypeStates> {
    return new Map((await this.store.all()).map((row) => [row.method, row]));
  }

  /** D8-67: read shared in the caller's transaction, so a removal in flight finishes first and one after waits for it. */
  sharedStateWithin(tx: Transaction, method: AccountMethod): Promise<RetireState> {
    return this.store.sharedState(tx, method);
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.run(work);
  }

  lockWithin(tx: Transaction, method: AccountMethod): Promise<SelectPaymentMethodType> {
    return this.store.lock(tx, method);
  }

  saveWithin(
    tx: Transaction,
    method: AccountMethod,
    patch: PaymentMethodTypePatch,
    now: Date,
  ): Promise<SelectPaymentMethodType> {
    return this.store.save(tx, method, patch, now);
  }
}
