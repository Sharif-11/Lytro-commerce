import { eq } from 'drizzle-orm';
import { CourierAdapterState, type CourierKey } from '@lytronix/validators';
import { courierAdapters, type SelectCourierAdapter } from '../../schema';
import type { Executor, Transaction } from '../../transactions';

/** CRR-23, CRR-24 (Slice 6.6): what changes when the operator retires, brings back or removes a courier. */
export interface CourierAdapterPatch {
  state: CourierAdapterState;
  suggestedKey: CourierKey | null;
  retiringSince: Date | null;
  removedAt: Date | null;
}

// CRR-23 to CRR-25 (Phase 6 Slice 6.6): each courier's platform-wide state. Read before any tenant context exists.
export class CourierAdapterRepository {
  async all(db: Executor): Promise<SelectCourierAdapter[]> {
    return db.select().from(courierAdapters);
  }

  async find(db: Executor, courierKey: CourierKey): Promise<SelectCourierAdapter | null> {
    const [row] = await db
      .select()
      .from(courierAdapters)
      .where(eq(courierAdapters.courierKey, courierKey));
    return row ?? null;
  }

  /**
   * CRR-24: a booking's claim reads its courier's state shared, so removal, which holds it exclusively, waits for every claim in flight,
   * and every claim after sees it removed. A courier with no row has never been retired, so there is nothing to wait for.
   */
  async sharedState(tx: Transaction, courierKey: CourierKey): Promise<CourierAdapterState> {
    const [row] = await tx
      .select({ state: courierAdapters.state })
      .from(courierAdapters)
      .where(eq(courierAdapters.courierKey, courierKey))
      .for('share');
    return row?.state ?? CourierAdapterState.Active;
  }

  /** Held until the transaction ends, so two operators can't retire and remove one courier at once. A missing row is made first. */
  async lock(tx: Transaction, courierKey: CourierKey): Promise<SelectCourierAdapter> {
    await tx.insert(courierAdapters).values({ courierKey }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(courierAdapters)
      .where(eq(courierAdapters.courierKey, courierKey))
      .for('update');
    if (!row) throw new Error('locking a courier found no row');
    return row;
  }

  async save(
    tx: Transaction,
    courierKey: CourierKey,
    patch: CourierAdapterPatch,
    now: Date,
  ): Promise<SelectCourierAdapter> {
    const [row] = await tx
      .update(courierAdapters)
      .set({ ...patch, updatedAt: now })
      .where(eq(courierAdapters.courierKey, courierKey))
      .returning();
    if (!row) throw new Error('saving a courier found no row');
    return row;
  }
}
