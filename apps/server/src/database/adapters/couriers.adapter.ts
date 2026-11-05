import { Inject, Injectable } from '@nestjs/common';
import {
  CourierRepository,
  TenantRepository,
  TransactionRunner,
  type CourierParcelPatch,
  type NewCourierCredentialUse,
  type NewCourierParcel,
  type SelectCourierConnection,
  type SelectCourierCredentialUse,
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
