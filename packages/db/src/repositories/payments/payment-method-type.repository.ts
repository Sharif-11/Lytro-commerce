import { eq } from 'drizzle-orm';
import { RetireState, type AccountMethod } from '@lytronix/validators';
import { paymentMethodTypes, type SelectPaymentMethodType } from '../../schema';
import type { Executor, Transaction } from '../../transactions';

/** WAL-18 (Slice 8.7): what changes when the operator retires, brings back or removes a payment method type. */
export interface PaymentMethodTypePatch {
  state: RetireState;
  retiringSince: Date | null;
  removedAt: Date | null;
}

// WAL-18 (Phase 8 Slice 8.7, D8-65): each payment method type's platform-wide state, the couriers' way (CourierAdapterRepository).
export class PaymentMethodTypeRepository {
  async all(db: Executor): Promise<SelectPaymentMethodType[]> {
    return db.select().from(paymentMethodTypes);
  }

  /**
   * D8-67: a shop switching a type on, or Lytro's own page turning it on, reads its state shared, so removal, which holds it
   * exclusively, waits for every such change in flight, and every change after sees it removed. A type with no row has never
   * been retired, so there is nothing to wait for.
   */
  async sharedState(tx: Transaction, method: AccountMethod): Promise<RetireState> {
    const [row] = await tx
      .select({ state: paymentMethodTypes.state })
      .from(paymentMethodTypes)
      .where(eq(paymentMethodTypes.method, method))
      .for('share');
    return row?.state ?? RetireState.Active;
  }

  /** Held until the transaction ends, so two operators can't retire and remove one type at once. A missing row is made first. */
  async lock(tx: Transaction, method: AccountMethod): Promise<SelectPaymentMethodType> {
    await tx.insert(paymentMethodTypes).values({ method }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(paymentMethodTypes)
      .where(eq(paymentMethodTypes.method, method))
      .for('update');
    if (!row) throw new Error('locking a payment method type found no row');
    return row;
  }

  async save(
    tx: Transaction,
    method: AccountMethod,
    patch: PaymentMethodTypePatch,
    now: Date,
  ): Promise<SelectPaymentMethodType> {
    const [row] = await tx
      .update(paymentMethodTypes)
      .set({ ...patch, updatedAt: now })
      .where(eq(paymentMethodTypes.method, method))
      .returning();
    if (!row) throw new Error('saving a payment method type found no row');
    return row;
  }
}
