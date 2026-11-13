import type {
  BlockingParcelRow,
  CourierConnectionPatch,
  CourierShopFacts,
  CourierParcelPatch,
  NewCourierCredentialUse,
  NewCourierEvent,
  NewCourierRawMessage,
  NewCourierParcel,
  NewCourierPayout,
  ParcelCheckWindow,
  PayoutParcelRow,
  SelectCourierConnection,
  CourierCredentialUseRow,
  SelectCourierEvent,
  SelectCourierMessageRoute,
  SelectCourierParcel,
  SelectCourierPayout,
  Transaction,
} from '@lytronix/db';
import type {
  RetireState,
  CourierConnectionState,
  CourierKey,
  RawMessageOutcome,
} from '@lytronix/validators';

/** Phase 6 Slice 6.1: each shop's courier connections, its parcels and the log of its credentials' uses. */
export interface CourierStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The shops the minute pass goes through. */
  listShopIds(): Promise<string[]>;
  listConnections(tx: Transaction, tenantId: string): Promise<SelectCourierConnection[]>;
  /** Slice 6.7 (c36-back): when each connection was last told its courier's retiring was undone, since a time. */
  retiringUndoneSince(tx: Transaction, tenantId: string, since: Date): Promise<Map<string, Date>>;
  findConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null>;
  findDefaultConnection(tx: Transaction, tenantId: string): Promise<SelectCourierConnection | null>;
  lockConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null>;
  /** Phase 6 close-out: one shop's connections change one at a time. */
  lockConnections(tx: Transaction, tenantId: string): Promise<void>;
  /** Throws UniqueViolation('account') when another shop has this courier account (agreed 2026-11-07). */
  saveConnection(
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
  ): Promise<SelectCourierConnection>;
  deleteConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null>;
  setDefaultConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    now: Date,
  ): Promise<SelectCourierConnection | null>;
  insertParcel(
    tx: Transaction,
    tenantId: string,
    values: NewCourierParcel,
  ): Promise<SelectCourierParcel>;
  liveParcel(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectCourierParcel | null>;
  lockParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
  ): Promise<SelectCourierParcel | null>;
  updateParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
    patch: CourierParcelPatch,
    now: Date,
  ): Promise<SelectCourierParcel>;
  clearAttention(tx: Transaction, tenantId: string, orderId: string, now: Date): Promise<number>;
  countCancelled(tx: Transaction, tenantId: string, orderId: string): Promise<number>;
  serialsInFlight(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    serials: string[],
  ): Promise<boolean>;
  dueForPass(
    tx: Transaction,
    tenantId: string,
    stuckBefore: Date,
    now: Date,
    limit: number,
  ): Promise<SelectCourierParcel[]>;
  updateConnection(
    tx: Transaction,
    tenantId: string,
    connectionId: string,
    patch: CourierConnectionPatch,
    now: Date,
  ): Promise<void>;
  /** DAT-51 (Phase 9 Slice 9.5): a verified message kept as it arrived, before it is read; its id. */
  keepRaw(tx: Transaction, tenantId: string, message: NewCourierRawMessage): Promise<string>;
  /** DAT-51: what reading the kept message gave -- the news it stored, or nothing it could read. */
  markRaw(
    tx: Transaction,
    tenantId: string,
    id: string,
    outcome: RawMessageOutcome,
    eventId: string | null,
  ): Promise<void>;
  /** CRR-13: stored once; null when it has come before. */
  insertEvent(
    tx: Transaction,
    tenantId: string,
    values: NewCourierEvent,
  ): Promise<SelectCourierEvent | null>;
  findEvent(tx: Transaction, tenantId: string, eventId: string): Promise<SelectCourierEvent | null>;
  lockEvent(tx: Transaction, tenantId: string, eventId: string): Promise<SelectCourierEvent | null>;
  finishEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
    values: { parcelId: string | null; problem: string | null },
    now: Date,
  ): Promise<void>;
  unappliedEvents(
    tx: Transaction,
    tenantId: string,
    storedBefore: Date,
    limit: number,
  ): Promise<SelectCourierEvent[]>;
  parcelForNews(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    ids: { consignmentId: string | null; invoice: string | null },
  ): Promise<SelectCourierParcel | null>;
  dueForCheck(
    tx: Transaction,
    tenantId: string,
    window: ParcelCheckWindow,
  ): Promise<SelectCourierParcel[]>;
  /** CRR-17 (Slice 6.5): when the oldest parcel still waiting to be paid was booked; null when none waits. */
  oldestUnpaid(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    changedSince: Date,
  ): Promise<Date | null>;
  knownPayouts(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    payoutIds: readonly string[],
  ): Promise<Set<string>>;
  /** Null when the payout has been read already. */
  insertPayout(
    tx: Transaction,
    tenantId: string,
    values: NewCourierPayout,
  ): Promise<SelectCourierPayout | null>;
  countPayout(
    tx: Transaction,
    tenantId: string,
    id: string,
    counts: { parcels: number; ours: number },
  ): Promise<void>;
  listPayouts(
    tx: Transaction,
    tenantId: string,
    filter: { courierKey: CourierKey | null; offset: number; limit: number },
  ): Promise<{ rows: SelectCourierPayout[]; total: number }>;
  findPayout(tx: Transaction, tenantId: string, id: string): Promise<SelectCourierPayout | null>;
  payoutParcels(
    tx: Transaction,
    tenantId: string,
    payout: Pick<SelectCourierPayout, 'courierKey' | 'payoutId'>,
  ): Promise<PayoutParcelRow[]>;
  /** CRR-24 (Slice 6.6): the courier's state, read shared in a booking's claim so removal waits for it. */
  adapterStateWithin(tx: Transaction, courierKey: CourierKey): Promise<RetireState>;
  blockingParcels(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    paidSince: Date,
  ): Promise<BlockingParcelRow[]>;
  shopFacts(tx: Transaction, tenantId: string, courierKey: CourierKey): Promise<CourierShopFacts>;
  /** CRR-11: read before any tenant context exists. */
  findRoute(tokenHash: string): Promise<SelectCourierMessageRoute | null>;
  replaceRoute(
    tx: Transaction,
    values: { tokenHash: string; tenantId: string; courierKey: CourierKey; connectionId: string },
  ): Promise<void>;
  deleteRoute(tx: Transaction, connectionId: string): Promise<void>;
  /** SEC-11: runs on its own, so the log failing never touches the call it records. */
  recordUse(tenantId: string, use: NewCourierCredentialUse): Promise<void>;
  listUses(
    tenantId: string,
    page: { offset: number; limit: number; failedOnly?: boolean },
  ): Promise<{ rows: CourierCredentialUseRow[]; total: number }>;
  /** ADM-03, MON-05: how many of the shop's courier calls failed or were refused since `since`. */
  countFailedUses(tenantId: string, since: Date): Promise<number>;
  deleteAllForTenant(tenantId: string): Promise<void>;
}
