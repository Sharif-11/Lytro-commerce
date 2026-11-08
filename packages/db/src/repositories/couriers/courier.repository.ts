import {
  and,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
  FINISHED_PARCEL_READINGS,
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
  courierPayouts,
  orders,
  type SelectCourierConnection,
  type SelectCourierCredentialUse,
  type SelectCourierEvent,
  type SelectCourierMessageRoute,
  type SelectCourierParcel,
  type SelectCourierPayout,
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
    | 'checksRestartedAt'
    | 'cashCollected'
    | 'codAtCourier'
    | 'attention'
    | 'paidAt'
    | 'payoutId'
  >
>;

export type CourierConnectionPatch = Partial<
  Pick<
    SelectCourierConnection,
    | 'credentials'
    | 'state'
    | 'messageSecrets'
    | 'lastMessageAt'
    | 'unsignedAt'
    | 'pasteWarnedAt'
    | 'payoutPage'
    | 'payoutPageSize'
  >
>;

/** CRR-17 (Slice 6.5): a payout as read from its courier. */
export type NewCourierPayout = Omit<
  typeof courierPayouts.$inferInsert,
  'id' | 'tenantId' | 'readAt' | 'parcels' | 'ours'
>;

/** CRR-24 (Slice 6.6): a parcel that holds its courier back from being removed, and the order it is for. */
export interface BlockingParcelRow {
  orderId: string;
  orderNumber: string | null;
  state: SelectCourierParcel['state'];
  settledAt: Date | null;
  reading: SelectCourierParcel['reading'];
  /** Slice 6.7: its courier's own last status, for "On its way". */
  courierStatus: string | null;
  paidAt: Date | null;
  lastChangeAt: Date | null;
  fulfillmentStatus: string;
}

/** CRR-23 (Slice 6.6): one shop's ties to a courier, for the operator's couriers page. */
export interface CourierShopFacts {
  connected: boolean;
  isDefault: boolean;
  onTheirWay: number;
}

/** CRR-17 (Slice 6.5): one parcel a payout settled, with the order it was for. */
export interface PayoutParcelRow {
  orderId: string;
  orderNumber: string | null;
  cod: string;
  cashCollected: string | null;
  deliveryCharge: string | null;
  reading: SelectCourierParcel['reading'];
}

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
/** SEC-11: one use of a shop's courier credentials, with its order's number where it was for one (Slice 6.7). */
export type CourierCredentialUseRow = SelectCourierCredentialUse & { orderNumber: string | null };

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
  /** Phase 6 close-out: one shop's connections change one at a time, so two first connections can't both be its default. */
  async lockConnections(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`courier_connections:${tenantId}`}, 0))`,
    );
  }

  async saveConnection(
    tx: Transaction,
    tenantId: string,
    values: {
      courierKey: CourierKey;
      credentials: Buffer;
      isDefault: boolean;
      state: CourierConnectionState;
      accountFingerprint: string | null;
    },
    now: Date,
  ): Promise<SelectCourierConnection> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(courierConnections)
      .values({ tenantId, ...values })
      .onConflictDoUpdate({
        target: [courierConnections.tenantId, courierConnections.courierKey],
        set: {
          credentials: values.credentials,
          state: values.state,
          accountFingerprint: values.accountFingerprint,
          updatedAt: now,
        },
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

  /**
   * Slice 6.7 (read agreed 2026-11-06): staff marked what a courier reported as seen. It clears on every parcel of the order, a
   * cancelled one too; its news stays. Answers how many it cleared.
   */
  async clearAttention(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    now: Date,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(courierParcels)
      .set({ attention: null, updatedAt: now })
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.orderId, orderId),
          isNotNull(courierParcels.attention),
        ),
      )
      .returning({ id: courierParcels.id });
    return rows.length;
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
      .where(
        and(
          eq(courierEvents.tenantId, tenantId),
          eq(courierEvents.parcelId, parcelId),
          // CRR-12 (Slice 6.5): being paid goes to the payout records, not the parcel's journey.
          sql`(${courierEvents.news}->>'paid') IS DISTINCT FROM 'true'`,
        ),
      )
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

  /**
   * CRR-17 (Slice 6.5): when the oldest of a courier's parcels still waiting to be paid was booked: finished, not yet paid and
   * changed since `changedSince`. Null when none waits, so nothing need be asked.
   */
  async oldestUnpaid(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    changedSince: Date,
  ): Promise<Date | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ oldest: courierParcels.createdAt })
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.courierKey, courierKey),
          eq(courierParcels.state, ParcelState.Booked),
          isNull(courierParcels.paidAt),
          inArray(courierParcels.reading, [...FINISHED_PARCEL_READINGS]),
          gte(courierParcels.lastChangeAt, changedSince),
        ),
      )
      .orderBy(asc(courierParcels.createdAt))
      .limit(1);
    return row?.oldest ?? null;
  }

  /** Which of these payouts have been read before. */
  async knownPayouts(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    payoutIds: readonly string[],
  ): Promise<Set<string>> {
    if (payoutIds.length === 0) return new Set();
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ payoutId: courierPayouts.payoutId })
      .from(courierPayouts)
      .where(
        and(
          eq(courierPayouts.tenantId, tenantId),
          eq(courierPayouts.courierKey, courierKey),
          inArray(courierPayouts.payoutId, [...payoutIds]),
        ),
      );
    return new Set(rows.map((row) => row.payoutId));
  }

  /** A payout read for the first time; null when it has been read already. */
  async insertPayout(
    tx: Transaction,
    tenantId: string,
    values: NewCourierPayout,
  ): Promise<SelectCourierPayout | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(courierPayouts)
      .values({ tenantId, ...values })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  /** How many parcels a payout settled, and how many of those Lytro booked. */
  async countPayout(
    tx: Transaction,
    tenantId: string,
    id: string,
    counts: { parcels: number; ours: number },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(courierPayouts)
      .set(counts)
      .where(and(eq(courierPayouts.tenantId, tenantId), eq(courierPayouts.id, id)));
  }

  /** CRR-17: the shop's payouts, the newest paid first; one courier's, or every courier's. */
  async listPayouts(
    tx: Transaction,
    tenantId: string,
    filter: { courierKey: CourierKey | null; offset: number; limit: number },
  ): Promise<{ rows: SelectCourierPayout[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = and(
      eq(courierPayouts.tenantId, tenantId),
      ...(filter.courierKey !== null ? [eq(courierPayouts.courierKey, filter.courierKey)] : []),
    );
    const [totals] = await tx.select({ total: count() }).from(courierPayouts).where(where);
    const rows = await tx
      .select()
      .from(courierPayouts)
      .where(where)
      .orderBy(desc(courierPayouts.paidAt), desc(courierPayouts.id))
      .limit(filter.limit)
      .offset(filter.offset);
    return { rows, total: totals?.total ?? 0 };
  }

  async findPayout(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectCourierPayout | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(courierPayouts)
      .where(and(eq(courierPayouts.tenantId, tenantId), eq(courierPayouts.id, id)));
    return row ?? null;
  }

  /** CRR-17: the parcels Lytro booked that a payout settled, with their orders, oldest first. */
  async payoutParcels(
    tx: Transaction,
    tenantId: string,
    payout: Pick<SelectCourierPayout, 'courierKey' | 'payoutId'>,
  ): Promise<PayoutParcelRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({
        orderId: courierParcels.orderId,
        orderNumber: orders.orderNumber,
        cod: courierParcels.cod,
        cashCollected: courierParcels.cashCollected,
        deliveryCharge: courierParcels.deliveryCharge,
        reading: courierParcels.reading,
      })
      .from(courierParcels)
      .innerJoin(
        orders,
        and(eq(orders.tenantId, courierParcels.tenantId), eq(orders.id, courierParcels.orderId)),
      )
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.courierKey, payout.courierKey),
          eq(courierParcels.payoutId, payout.payoutId),
        ),
      )
      .orderBy(asc(courierParcels.createdAt), asc(courierParcels.id));
  }

  /**
   * CRR-24 (Slice 6.6): this shop's parcels that hold a courier back from being removed: a booking not yet settled; one settled whose
   * order hasn't been delivered, part delivered, returned or cancelled; and one whose courier reported a result and hasn't paid for it,
   * changed since `paidSince`. A cancelled booking or a refused one holds nothing back.
   */
  async blockingParcels(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    paidSince: Date,
  ): Promise<BlockingParcelRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const finished = [...FINISHED_PARCEL_READINGS];
    return tx
      .select({
        orderId: courierParcels.orderId,
        orderNumber: orders.orderNumber,
        state: courierParcels.state,
        settledAt: courierParcels.settledAt,
        reading: courierParcels.reading,
        courierStatus: courierParcels.courierStatus,
        paidAt: courierParcels.paidAt,
        lastChangeAt: courierParcels.lastChangeAt,
        fulfillmentStatus: orders.fulfillmentStatus,
      })
      .from(courierParcels)
      .innerJoin(
        orders,
        and(eq(orders.tenantId, courierParcels.tenantId), eq(orders.id, courierParcels.orderId)),
      )
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.courierKey, courierKey),
          or(
            inArray(courierParcels.state, [ParcelState.Booking, ParcelState.Unknown]),
            and(eq(courierParcels.state, ParcelState.Booked), isNull(courierParcels.settledAt)),
            and(
              eq(courierParcels.state, ParcelState.Booked),
              sql`${orders.fulfillmentStatus} IN ('processing', 'shipped')`,
              sql`${orders.statusOverride} IS DISTINCT FROM 'cancelled'`,
            ),
            and(
              eq(courierParcels.state, ParcelState.Booked),
              inArray(courierParcels.reading, finished),
              isNull(courierParcels.paidAt),
              gte(courierParcels.lastChangeAt, paidSince),
            ),
          ),
        ),
      )
      .orderBy(asc(courierParcels.createdAt), asc(courierParcels.id));
  }

  /** CRR-23 (Slice 6.6): whether this shop is connected to a courier, whether it is its default, and how many of its parcels are on their way. */
  async shopFacts(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<CourierShopFacts> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [connection] = await tx
      .select({ isDefault: courierConnections.isDefault })
      .from(courierConnections)
      .where(
        and(
          eq(courierConnections.tenantId, tenantId),
          eq(courierConnections.courierKey, courierKey),
        ),
      );
    const [moving] = await tx
      .select({ total: count() })
      .from(courierParcels)
      .where(
        and(
          eq(courierParcels.tenantId, tenantId),
          eq(courierParcels.courierKey, courierKey),
          eq(courierParcels.state, ParcelState.Booked),
          sql`(${courierParcels.reading} IS NULL OR ${courierParcels.reading} NOT IN ('delivered', 'partly_delivered', 'returning'))`,
        ),
      );
    return {
      connected: connection !== undefined,
      isDefault: connection?.isDefault ?? false,
      onTheirWay: moving?.total ?? 0,
    };
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

  /**
   * SEC-11: the log, newest first, each use with its order's number where it was for one (Slice 6.7); only the failed
   * ones when asked (ADM-03, D8-26).
   */
  async listUses(
    tx: Transaction,
    tenantId: string,
    page: { offset: number; limit: number; failedOnly?: boolean },
  ): Promise<{ rows: CourierCredentialUseRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = and(
      eq(courierCredentialUses.tenantId, tenantId),
      page.failedOnly === true ? eq(courierCredentialUses.succeeded, false) : undefined,
    );
    const [totals] = await tx.select({ total: count() }).from(courierCredentialUses).where(where);
    const rows = await tx
      .select({ use: courierCredentialUses, orderNumber: orders.orderNumber })
      .from(courierCredentialUses)
      .leftJoin(
        orders,
        and(
          eq(orders.tenantId, courierCredentialUses.tenantId),
          eq(orders.id, courierCredentialUses.orderId),
        ),
      )
      .where(where)
      .orderBy(desc(courierCredentialUses.at), desc(courierCredentialUses.id))
      .limit(page.limit)
      .offset(page.offset);
    return {
      rows: rows.map((row) => ({ ...row.use, orderNumber: row.orderNumber })),
      total: totals?.total ?? 0,
    };
  }

  /** ADM-03, MON-05: how many of the shop's courier calls failed or were refused since `since`. */
  async countFailedUsesSince(tx: Transaction, tenantId: string, since: Date): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ value: count() })
      .from(courierCredentialUses)
      .where(
        and(
          eq(courierCredentialUses.tenantId, tenantId),
          eq(courierCredentialUses.succeeded, false),
          gte(courierCredentialUses.at, since),
        ),
      );
    return row?.value ?? 0;
  }

  /** LIF-19: the day-60 deletion's couriers step. Parcels go with their orders too; this is safe to run either way. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(courierEvents).where(eq(courierEvents.tenantId, tenantId));
    await tx.delete(courierPayouts).where(eq(courierPayouts.tenantId, tenantId));
    await tx.delete(courierMessageRoutes).where(eq(courierMessageRoutes.tenantId, tenantId));
    await tx.delete(courierParcels).where(eq(courierParcels.tenantId, tenantId));
    await tx.delete(courierConnections).where(eq(courierConnections.tenantId, tenantId));
    await tx.delete(courierCredentialUses).where(eq(courierCredentialUses.tenantId, tenantId));
  }
}
