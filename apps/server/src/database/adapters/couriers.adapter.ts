import { Inject, Injectable } from '@nestjs/common';
import {
  ActivityLogRepository,
  CourierAdapterRepository,
  CourierRepository,
  TenantRepository,
  TransactionRunner,
  type BlockingParcelRow,
  type CourierConnectionPatch,
  type CourierShopFacts,
  type CourierParcelPatch,
  type NewCourierCredentialUse,
  type NewCourierEvent,
  type NewCourierParcel,
  type NewCourierPayout,
  type ParcelCheckWindow,
  type PayoutParcelRow,
  type SelectCourierConnection,
  type CourierCredentialUseRow,
  type SelectCourierEvent,
  type SelectCourierMessageRoute,
  type SelectCourierParcel,
  type SelectCourierPayout,
  type Transaction,
} from '@lytronix/db';
import {
  AuditAction,
  type CourierAdapterState,
  type CourierConnectionState,
  type CourierKey,
} from '@lytronix/validators';
import type { CourierStore } from '../../modules/couriers/ports/courier-store';

// Slice 6.7: more undos than this in a week would be an operator's mistake; the latest per courier is among them.
const RETIRING_UNDONE_READ_LIMIT = 50;
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCourierStore implements CourierStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CourierRepository) private readonly couriers: CourierRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(CourierAdapterRepository) private readonly adapters: CourierAdapterRepository,
    @Inject(ActivityLogRepository) private readonly log: ActivityLogRepository,
  ) {}

  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  listConnections(tx: Transaction, tenantId: string): Promise<SelectCourierConnection[]> {
    return this.couriers.listConnections(tx, tenantId);
  }

  async retiringUndoneSince(
    tx: Transaction,
    tenantId: string,
    since: Date,
  ): Promise<Map<string, Date>> {
    // Newest first, so the first entry for a connection is its latest; a shop has a handful of couriers.
    const rows = await this.log.list(
      tx,
      tenantId,
      { action: AuditAction.CourierRetiringUndone, dateFrom: since },
      null,
      RETIRING_UNDONE_READ_LIMIT,
    );
    const back = new Map<string, Date>();
    for (const row of rows) {
      if (row.targetId !== null && !back.has(row.targetId)) back.set(row.targetId, row.createdAt);
    }
    return back;
  }

  findConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null> {
    return this.couriers.findConnection(tx, tenantId, courierKey);
  }

  lockConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null> {
    return this.couriers.lockConnection(tx, tenantId, courierKey);
  }

  findDefaultConnection(
    tx: Transaction,
    tenantId: string,
  ): Promise<SelectCourierConnection | null> {
    return this.couriers.findDefaultConnection(tx, tenantId);
  }

  saveConnection(
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
    return this.couriers.saveConnection(tx, tenantId, values, now);
  }

  deleteConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
  ): Promise<SelectCourierConnection | null> {
    return this.couriers.deleteConnection(tx, tenantId, courierKey);
  }

  setDefaultConnection(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    now: Date,
  ): Promise<SelectCourierConnection | null> {
    return this.couriers.setDefaultConnection(tx, tenantId, courierKey, now);
  }

  insertParcel(
    tx: Transaction,
    tenantId: string,
    values: NewCourierParcel,
  ): Promise<SelectCourierParcel> {
    return this.couriers.insertParcel(tx, tenantId, values);
  }

  liveParcel(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectCourierParcel | null> {
    return this.couriers.liveParcel(tx, tenantId, orderId);
  }

  lockParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
  ): Promise<SelectCourierParcel | null> {
    return this.couriers.lockParcel(tx, tenantId, parcelId);
  }

  updateParcel(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
    patch: CourierParcelPatch,
    now: Date,
  ): Promise<SelectCourierParcel> {
    return this.couriers.updateParcel(tx, tenantId, parcelId, patch, now);
  }

  clearAttention(tx: Transaction, tenantId: string, orderId: string, now: Date): Promise<number> {
    return this.couriers.clearAttention(tx, tenantId, orderId, now);
  }

  countCancelled(tx: Transaction, tenantId: string, orderId: string): Promise<number> {
    return this.couriers.countCancelled(tx, tenantId, orderId);
  }

  serialsInFlight(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    serials: string[],
  ): Promise<boolean> {
    return this.couriers.serialsInFlight(tx, tenantId, orderId, serials);
  }

  dueForPass(
    tx: Transaction,
    tenantId: string,
    stuckBefore: Date,
    now: Date,
    limit: number,
  ): Promise<SelectCourierParcel[]> {
    return this.couriers.dueForPass(tx, tenantId, stuckBefore, now, limit);
  }

  updateConnection(
    tx: Transaction,
    tenantId: string,
    connectionId: string,
    patch: CourierConnectionPatch,
    now: Date,
  ): Promise<void> {
    return this.couriers.updateConnection(tx, tenantId, connectionId, patch, now);
  }

  insertEvent(
    tx: Transaction,
    tenantId: string,
    values: NewCourierEvent,
  ): Promise<SelectCourierEvent | null> {
    return this.couriers.insertEvent(tx, tenantId, values);
  }

  findEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
  ): Promise<SelectCourierEvent | null> {
    return this.couriers.findEvent(tx, tenantId, eventId);
  }

  lockEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
  ): Promise<SelectCourierEvent | null> {
    return this.couriers.lockEvent(tx, tenantId, eventId);
  }

  finishEvent(
    tx: Transaction,
    tenantId: string,
    eventId: string,
    values: { parcelId: string | null; problem: string | null },
    now: Date,
  ): Promise<void> {
    return this.couriers.finishEvent(tx, tenantId, eventId, values, now);
  }

  unappliedEvents(
    tx: Transaction,
    tenantId: string,
    storedBefore: Date,
    limit: number,
  ): Promise<SelectCourierEvent[]> {
    return this.couriers.unappliedEvents(tx, tenantId, storedBefore, limit);
  }

  parcelForNews(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    ids: { consignmentId: string | null; invoice: string | null },
  ): Promise<SelectCourierParcel | null> {
    return this.couriers.parcelForNews(tx, tenantId, courierKey, ids);
  }

  dueForCheck(
    tx: Transaction,
    tenantId: string,
    window: ParcelCheckWindow,
  ): Promise<SelectCourierParcel[]> {
    return this.couriers.dueForCheck(tx, tenantId, window);
  }

  oldestUnpaid(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    changedSince: Date,
  ): Promise<Date | null> {
    return this.couriers.oldestUnpaid(tx, tenantId, courierKey, changedSince);
  }

  knownPayouts(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    payoutIds: readonly string[],
  ): Promise<Set<string>> {
    return this.couriers.knownPayouts(tx, tenantId, courierKey, payoutIds);
  }

  insertPayout(
    tx: Transaction,
    tenantId: string,
    values: NewCourierPayout,
  ): Promise<SelectCourierPayout | null> {
    return this.couriers.insertPayout(tx, tenantId, values);
  }

  countPayout(
    tx: Transaction,
    tenantId: string,
    id: string,
    counts: { parcels: number; ours: number },
  ): Promise<void> {
    return this.couriers.countPayout(tx, tenantId, id, counts);
  }

  listPayouts(
    tx: Transaction,
    tenantId: string,
    filter: { courierKey: CourierKey | null; offset: number; limit: number },
  ): Promise<{ rows: SelectCourierPayout[]; total: number }> {
    return this.couriers.listPayouts(tx, tenantId, filter);
  }

  findPayout(tx: Transaction, tenantId: string, id: string): Promise<SelectCourierPayout | null> {
    return this.couriers.findPayout(tx, tenantId, id);
  }

  payoutParcels(
    tx: Transaction,
    tenantId: string,
    payout: Pick<SelectCourierPayout, 'courierKey' | 'payoutId'>,
  ): Promise<PayoutParcelRow[]> {
    return this.couriers.payoutParcels(tx, tenantId, payout);
  }

  adapterStateWithin(tx: Transaction, courierKey: CourierKey): Promise<CourierAdapterState> {
    return this.adapters.sharedState(tx, courierKey);
  }

  blockingParcels(
    tx: Transaction,
    tenantId: string,
    courierKey: CourierKey,
    paidSince: Date,
  ): Promise<BlockingParcelRow[]> {
    return this.couriers.blockingParcels(tx, tenantId, courierKey, paidSince);
  }

  shopFacts(tx: Transaction, tenantId: string, courierKey: CourierKey): Promise<CourierShopFacts> {
    return this.couriers.shopFacts(tx, tenantId, courierKey);
  }

  findRoute(tokenHash: string): Promise<SelectCourierMessageRoute | null> {
    return this.couriers.findRoute(this.database.handle.db, tokenHash);
  }

  replaceRoute(
    tx: Transaction,
    values: { tokenHash: string; tenantId: string; courierKey: CourierKey; connectionId: string },
  ): Promise<void> {
    return this.couriers.replaceRoute(tx, values);
  }

  deleteRoute(tx: Transaction, connectionId: string): Promise<void> {
    return this.couriers.deleteRoute(tx, connectionId);
  }

  recordUse(tenantId: string, use: NewCourierCredentialUse): Promise<void> {
    return this.run(tenantId, (tx) => this.couriers.insertUse(tx, tenantId, use));
  }

  listUses(
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: CourierCredentialUseRow[]; total: number }> {
    return this.run(tenantId, (tx) => this.couriers.listUses(tx, tenantId, page));
  }

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.run(tenantId, (tx) => this.couriers.deleteAllForTenant(tx, tenantId));
  }
}
