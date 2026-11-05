import {
  and,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
  LIVE_PARCEL_STATES,
  ParcelState,
  type CourierCallAction,
  type CourierConnectionState,
  type CourierKey,
} from '@lytronix/validators';
import {
  courierConnections,
  courierCredentialUses,
  courierParcels,
  type SelectCourierConnection,
  type SelectCourierCredentialUse,
  type SelectCourierParcel,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

const LIVE = [...LIVE_PARCEL_STATES];

export type NewCourierParcel = Omit<
  typeof courierParcels.$inferInsert,
  'id' | 'tenantId' | 'createdAt' | 'updatedAt'
>;

export type CourierParcelPatch = Partial<
  Pick<
    SelectCourierParcel,
    | 'state'
    | 'consignmentId'
    | 'trackingCode'
    | 'courierStatus'
    | 'deliveryCharge'
    | 'refusal'
    | 'settledAt'
    | 'settleProblem'
    | 'lookUps'
    | 'notFound'
    | 'nextLookUpAt'
  >
>;

/** SEC-11 (Slice 6.1): one outbound call made with a stored courier credential, without the credential. */
export interface NewCourierCredentialUse {
  courierKey: CourierKey;
  action: CourierCallAction;
  connectionId: string | null;
  orderId: string | null;
  succeeded: boolean;
  at: Date;
}

// CRR-02 to CRR-08, CRR-18, CRR-20, SEC-11 (Phase 6 Slice 6.1): each shop's courier connections, parcels and credential log. Every
// method sets its tenant context.
export class CourierRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async listConnections(tx: Transaction, tenantId: string): Promise<SelectCourierConnection[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(courierConnections)
      .where(eq(courierConnections.tenantId, tenantId))
      .orderBy(asc(courierConnections.createdAt), asc(courierConnections.id));
  }

  async findConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierConnections)
      .where(
        and(
          eq(courierConnections.tenantId, tenantId),
          eq(courierConnections.courierKey, courierKey),
        ),
      );
    return row ?? null;
  }

  async findDefaultConnection(
    tx: Transaction,
    tenantId: string,
  ): Promise<SelectCourierConnection | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierConnections)
      .where(
        and(eq(courierConnections.tenantId, tenantId), eq(courierConnections.isDefault, true)),
      );
    return row ?? null;
  }

  /** CRR-03: new credentials replace the old, and whatever had made the login refused is cleared with them. */
  async saveConnection(
    tx: Transaction,
    tenantId: string,
    values: {
      courierKey: CourierKey;
      credentials: Buffer;
      isDefault: boolean;
      state: CourierConnectionState;
    },
    now: Date,
  ): Promise<SelectCourierConnection> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(courierConnections)
      .values({ tenantId, ...values })
      .onConflictDoUpdate({
        target: [courierConnections.tenantId, courierConnections.courierKey],
        set: { credentials: values.credentials, state: values.state, updatedAt: now },
      })
      .returning();
    if (!row) throw new Error('saving a courier connection returned no row');
    return row;
  }

  /** CRR-20: credentials go with the connection; its parcels stay. */
  async deleteConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .delete(courierConnections)
      .where(
        and(
          eq(courierConnections.tenantId, tenantId),
          eq(courierConnections.courierKey, courierKey),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** CRR-05: this connection is the shop's default and no other is; null when it isn't connected. */
  async setDefaultConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    now: Date,
  ): Promise<SelectCourierConnection | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(courierConnections)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(courierConnections.tenantId, tenantId),
          eq(courierConnections.isDefault, true),
          ne(courierConnections.courierKey, courierKey),
        ),
      );
    const [row] = await tx
      .update(courierConnections)
      .set({ isDefault: true, updatedAt: now })
      .where(
        and(
          eq(courierConnections.tenantId, tenantId),
          eq(courierConnections.courierKey, courierKey),
        ),
      )
      .returning();
    return row ?? null;
  }

  async insertParcel(
    tx: Transaction,
    tenantId: string,
    values: NewCourierParcel,
  ): Promise<SelectCourierParcel> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(courierParcels)
      .values({ tenantId, ...values })
      .returning();
    if (!row) throw new Error('inserting a parcel returned no row');
    return row;
  }

  /** CRR-08: the order's one live parcel, if it has one. */
  async liveParcel(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectCourierParcel | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.orderId, orderId),
          inArray(courierParcels.state, LIVE),
        ),
      );
    return row ?? null;
  }

  /** The order's newest parcel in any state, for the order page. */
  async latestParcel(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectCourierParcel | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierParcels)
      .where(and(eq(courierParcels.tenantId, tenantId), eq(courierParcels.orderId, orderId)))
      .orderBy(desc(courierParcels.createdAt), desc(courierParcels.id))
      .limit(1);
    return row ?? null;
  }

  /** The parcel, held until the transaction ends. */
  async lockParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
  ): Promise<SelectCourierParcel | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierParcels)
      .where(and(eq(courierParcels.tenantId, tenantId), eq(courierParcels.id, parcelId)))
      .for('update');
    return row ?? null;
  }

  async updateParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
    patch: CourierParcelPatch,
    now: Date,
  ): Promise<SelectCourierParcel> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(courierParcels)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(courierParcels.tenantId, tenantId), eq(courierParcels.id, parcelId)))
      .returning();
    if (!row) throw new Error('updating a parcel found no row');
    return row;
  }

  /** How many of the order's bookings were cancelled: each new attempt after one needs its own invoice. */
  async countCancelled(tx: Transaction, tenantId: string, orderId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ total: count() })
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.orderId, orderId),
          eq(courierParcels.state, ParcelState.Cancelled),
        ),
      );
    return row?.total ?? 0;
  }

  /** WAL-21, read agreed 2026-11-04: the pay-as-you-go fees bookings have set aside, until each is charged or let go. */
  async feesHeld(tx: Transaction, tenantId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${courierParcels.feeHeld}), 0)::text` })
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          inArray(courierParcels.state, LIVE),
          isNull(courierParcels.settledAt),
          sql`${courierParcels.feeHeld} > 0`,
        ),
      );
    return Number(row?.total ?? 0).toFixed(2);
  }

  /** INV-14: another order's booking, not yet settled, that named one of these serials. */
  async serialsInFlight(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    serials: string[],
  ): Promise<boolean> {
    if (serials.length === 0) return false;
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ id: courierParcels.id })
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          ne(courierParcels.orderId, orderId),
          inArray(courierParcels.state, LIVE),
          isNull(courierParcels.settledAt),
          arrayOverlaps(courierParcels.serialNumbers, serials),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * D6-11: the minute pass's work, oldest first: a booking out longer than a call can last, an answer that was lost and is due to
   * be asked after, and a parcel accepted but not settled with no problem for staff to clear.
   */
  async dueForPass(
    tx: Transaction,
    tenantId: string,
    stuckBefore: Date,
    now: Date,
    limit: number,
  ): Promise<SelectCourierParcel[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          isNull(courierParcels.settledAt),
          or(
            and(
              eq(courierParcels.state, ParcelState.Booking),
              lte(courierParcels.createdAt, stuckBefore),
            ),
            and(
              eq(courierParcels.state, ParcelState.Unknown),
              lte(courierParcels.nextLookUpAt, now),
            ),
            and(eq(courierParcels.state, ParcelState.Booked), isNull(courierParcels.settleProblem)),
          ),
        ),
      )
      .orderBy(asc(courierParcels.createdAt), asc(courierParcels.id))
      .limit(limit);
  }

  async insertUse(
    tx: Transaction,
    tenantId: string,
    values: NewCourierCredentialUse,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.insert(courierCredentialUses).values({ tenantId, ...values });
  }

  async listUses(
    tx: Transaction,
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectCourierCredentialUse[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = eq(courierCredentialUses.tenantId, tenantId);
    const [totals] = await tx.select({ total: count() }).from(courierCredentialUses).where(where);
    const rows = await tx
      .select()
      .from(courierCredentialUses)
      .where(where)
      .orderBy(desc(courierCredentialUses.at), desc(courierCredentialUses.id))
      .limit(page.limit)
      .offset(page.offset);
    return { rows, total: totals?.total ?? 0 };
  }

  /** LIF-19: the day-60 deletion's couriers step. Parcels go with their orders too; this is safe to run either way. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(courierParcels).where(eq(courierParcels.tenantId, tenantId));
    await tx.delete(courierConnections).where(eq(courierConnections.tenantId, tenantId));
    await tx.delete(courierCredentialUses).where(eq(courierCredentialUses.tenantId, tenantId));
  }
}
