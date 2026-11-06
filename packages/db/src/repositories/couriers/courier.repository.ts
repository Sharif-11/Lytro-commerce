import {
  and,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
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
  courierEvents,
  courierMessageRoutes,
  courierParcels,
  type SelectCourierConnection,
  type SelectCourierCredentialUse,
  type SelectCourierEvent,
  type SelectCourierMessageRoute,
  type SelectCourierParcel,
} from '../../schema';
import type { Executor, Transaction, TransactionRunner } from '../../transactions';

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
    | 'reading'
    | 'lastNewsAt'
    | 'lastChangeAt'
    | 'lastMessageAt'
    | 'lastCheckAt'
    | 'checksStoppedAt'
    | 'cashCollected'
    | 'codAtCourier'
    | 'attention'
  >
>;

export type CourierConnectionPatch = Partial<
  Pick<
    SelectCourierConnection,
    'credentials' | 'state' | 'messageSecrets' | 'lastMessageAt' | 'unsignedAt' | 'pasteWarnedAt'
  >
>;

export type NewCourierEvent = Omit<
  typeof courierEvents.$inferInsert,
  'id' | 'tenantId' | 'receivedAt' | 'appliedAt' | 'problem' | 'parcelId'
>;

/** Slice 6.2: what the night check needs to choose its parcels (D6-4). */
export interface ParcelCheckWindow {
  createdBefore: Date;
  quietBefore: Date;
  limit: number;
}

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

  /** Slice 6.3: held while a courier's one-use login is renewed, so two can't both try it. */
  async lockConnection(
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
      )
      .for('update');
    return row ?? null;
  }

  async updateConnection(
    tx: Transaction,
    tenantId: string,
    connectionId: string,
    patch: CourierConnectionPatch,
    now: Date,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(courierConnections)
      .set({ ...patch, updatedAt: now })
      .where(
        and(eq(courierConnections.tenantId, tenantId), eq(courierConnections.id, connectionId)),
      );
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

  /**
   * CRR-13: stores a piece of news once; null when it has been stored before. A courier's retry, or the same answer asked for
   * twice, adds nothing.
   */
  async insertEvent(
    tx: Transaction,
    tenantId: string,
    values: NewCourierEvent,
  ): Promise<SelectCourierEvent | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(courierEvents)
      .values({ tenantId, ...values })
      .onConflictDoNothing({
        target: [courierEvents.tenantId, courierEvents.courierKey, courierEvents.dedupeKey],
      })
      .returning();
    return row ?? null;
  }

  async findEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
  ): Promise<SelectCourierEvent | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierEvents)
      .where(and(eq(courierEvents.tenantId, tenantId), eq(courierEvents.id, eventId)));
    return row ?? null;
  }

  /** The event, held until the transaction ends, so two passes can't apply it twice. */
  async lockEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
  ): Promise<SelectCourierEvent | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierEvents)
      .where(and(eq(courierEvents.tenantId, tenantId), eq(courierEvents.id, eventId)))
      .for('update');
    return row ?? null;
  }

  async finishEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
    values: { parcelId: string | null; problem: string | null },
    now: Date,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(courierEvents)
      .set({ ...values, appliedAt: now })
      .where(and(eq(courierEvents.tenantId, tenantId), eq(courierEvents.id, eventId)));
  }

  /** The minute pass's work: news stored before this and not applied yet, oldest first. */
  async unappliedEvents(
    tx: Transaction,
    tenantId: string,
    storedBefore: Date,
    limit: number,
  ): Promise<SelectCourierEvent[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(courierEvents)
      .where(
        and(
          eq(courierEvents.tenantId, tenantId),
          isNull(courierEvents.appliedAt),
          lte(courierEvents.receivedAt, storedBefore),
        ),
      )
      .orderBy(asc(courierEvents.receivedAt), asc(courierEvents.id))
      .limit(limit);
  }

  /**
   * The parcel a piece of news is about, by the courier's number and otherwise by our own. An invoice can be on an earlier refused
   * parcel of the order too, so a live one comes first, then the newest.
   */
  async parcelForNews(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    ids: { consignmentId: string | null; invoice: string | null },
  ): Promise<SelectCourierParcel | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const bySame = [
      ...(ids.consignmentId !== null ? [eq(courierParcels.consignmentId, ids.consignmentId)] : []),
      ...(ids.invoice !== null ? [eq(courierParcels.invoice, ids.invoice)] : []),
    ];
    if (bySame.length === 0) return null;
    const [row] = await tx
      .select()
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.courierKey, courierKey),
          or(...bySame),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${courierParcels.state} IN ('booking', 'booked', 'unknown') THEN 0 ELSE 1 END`,
        desc(courierParcels.createdAt),
      )
      .limit(1);
    return row ?? null;
  }

  /** CRR-12: a parcel's news, newest first, for the order page. */
  async listEvents(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
    limit: number,
  ): Promise<SelectCourierEvent[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(courierEvents)
      .where(and(eq(courierEvents.tenantId, tenantId), eq(courierEvents.parcelId, parcelId)))
      .orderBy(desc(courierEvents.receivedAt), desc(courierEvents.id))
      .limit(limit);
  }

  /** Slice 6.2 read: the courier's latest words about an order's newest parcel, for its tracking. */
  async latestMessage(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectCourierEvent | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ event: courierEvents })
      .from(courierEvents)
      .innerJoin(courierParcels, eq(courierParcels.id, courierEvents.parcelId))
      .where(
        and(
          eq(courierEvents.tenantId, tenantId),
          eq(courierParcels.orderId, orderId),
          inArray(courierParcels.state, LIVE),
          sql`(${courierEvents.messageEn} IS NOT NULL OR ${courierEvents.messageBn} IS NOT NULL)`,
          sql`${courierEvents.news}->>'forShopper' = 'true'`,
        ),
      )
      .orderBy(desc(courierEvents.receivedAt), desc(courierEvents.id))
      .limit(1);
    return row?.event ?? null;
  }

  /** D6-4: the night check's parcels, oldest first: on their way, old enough and quiet long enough. */
  async dueForCheck(
    tx: Transaction,
    tenantId: string,
    window: ParcelCheckWindow,
  ): Promise<SelectCourierParcel[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.state, ParcelState.Booked),
          isNotNull(courierParcels.settledAt),
          isNull(courierParcels.checksStoppedAt),
          lte(courierParcels.createdAt, window.createdBefore),
          sql`(${courierParcels.reading} IS NULL OR ${courierParcels.reading} NOT IN ('delivered', 'partly_delivered', 'returning'))`,
          or(
            isNull(courierParcels.lastMessageAt),
            lte(courierParcels.lastMessageAt, window.quietBefore),
          ),
        ),
      )
      .orderBy(asc(courierParcels.createdAt), asc(courierParcels.id))
      .limit(window.limit);
  }

  /** CRR-11: whose connection a message address belongs to; read before any tenant context exists. */
  async findRoute(db: Executor, tokenHash: string): Promise<SelectCourierMessageRoute | null> {
    const [row] = await db
      .select()
      .from(courierMessageRoutes)
      .where(eq(courierMessageRoutes.tokenHash, tokenHash));
    return row ?? null;
  }

  /** CRR-03: a connection's one address; a new one replaces the old, which stops working at once. */
  async replaceRoute(
    tx: Transaction,
    values: { tokenHash: string; tenantId: string; courierKey: CourierKey; connectionId: string },
  ): Promise<void> {
    await tx
      .delete(courierMessageRoutes)
      .where(eq(courierMessageRoutes.connectionId, values.connectionId));
    await tx.insert(courierMessageRoutes).values(values);
  }

  /** CRR-20: a disconnected courier's address is refused from now on. */
  async deleteRoute(tx: Transaction, connectionId: string): Promise<void> {
    await tx
      .delete(courierMessageRoutes)
      .where(eq(courierMessageRoutes.connectionId, connectionId));
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
    await tx.delete(courierEvents).where(eq(courierEvents.tenantId, tenantId));
    await tx.delete(courierMessageRoutes).where(eq(courierMessageRoutes.tenantId, tenantId));
    await tx.delete(courierParcels).where(eq(courierParcels.tenantId, tenantId));
    await tx.delete(courierConnections).where(eq(courierConnections.tenantId, tenantId));
    await tx.delete(courierCredentialUses).where(eq(courierCredentialUses.tenantId, tenantId));
  }
}
