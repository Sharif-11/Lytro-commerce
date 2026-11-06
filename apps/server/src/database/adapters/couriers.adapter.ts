import { Inject, Injectable } from '@nestjs/common';
import {
  CourierRepository,
  TenantRepository,
  TransactionRunner,
  type CourierConnectionPatch,
  type CourierParcelPatch,
  type NewCourierCredentialUse,
  type NewCourierEvent,
  type NewCourierParcel,
  type ParcelCheckWindow,
  type SelectCourierConnection,
  type SelectCourierCredentialUse,
  type SelectCourierEvent,
  type SelectCourierMessageRoute,
  type SelectCourierParcel,
  type Transaction,
} from '@lytronix/db';
import type { CourierConnectionState, CourierKey } from '@lytronix/validators';
import type { CourierStore } from '../../modules/couriers/ports/courier-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCourierStore implements CourierStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CourierRepository) private readonly couriers: CourierRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
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
  ): Promise<{ rows: SelectCourierCredentialUse[]; total: number }> {
    return this.run(tenantId, (tx) => this.couriers.listUses(tx, tenantId, page));
  }

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.run(tenantId, (tx) => this.couriers.deleteAllForTenant(tx, tenantId));
  }
}
