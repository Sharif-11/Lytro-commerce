import { eq, sql } from 'drizzle-orm';
import { RetireState, type AccountMethod } from '@lytronix/validators';
import { paymentMethodTypes, type SelectPaymentMethodType } from '../../schema';
import type { Executor, Transaction } from '../../transactions';

/** WAL-18 (Slice 8.7): what changes when the operator retires, brings back or removes a payment method type. */
export interface PaymentMethodTypePatch {
  state: RetireState;
  retiringSince: Date | null;
  removedAt: Date | null;
}

/**
 * D8-65, D8-67: a lock on the type itself, held until the transaction ends -- shared by every switch-on, exclusive for a
 * retire, its undo and removal -- so the two wait for each other even while the type has never been retired and has no row
 * to lock (the Phase 8 close-out's review C, S2).
 */
const typeLockKey = (method: AccountMethod) =>
  sql`hashtextextended(${`payment_method_type:${method}`}, 0)`;

// WAL-18 (Phase 8 Slice 8.7, D8-65): each payment method type's platform-wide state, the couriers' way (CourierAdapterRepository).
export class PaymentMethodTypeRepository {
  async all(db: Executor): Promise<SelectPaymentMethodType[]> {
    return db.select().from(paymentMethodTypes);
  }

  /**
   * D8-67: a shop switching a type on, or Lytro's own page turning it on, reads its state shared, so a retire or a removal,
   * which holds it exclusively, waits for every such change in flight, and every change after sees it retiring or removed --
   * the first retire of a type with no row yet as well.
   */
  async sharedState(tx: Transaction, method: AccountMethod): Promise<RetireState> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(${typeLockKey(method)})`);
    const [row] = await tx
      .select({ state: paymentMethodTypes.state })
      .from(paymentMethodTypes)
      .where(eq(paymentMethodTypes.method, method))
      .for('share');
    return row?.state ?? RetireState.Active;
  }

  /**
   * Held until the transaction ends, so two operators can't retire and remove one type at once, and no shop switches it on
   * meanwhile. A missing row is made first.
   */
  async lock(tx: Transaction, method: AccountMethod): Promise<SelectPaymentMethodType> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${typeLockKey(method)})`);
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
