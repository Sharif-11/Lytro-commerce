import { Inject, Injectable } from '@nestjs/common';
import {
  CustomerRepository,
  ShopperRepository,
  TransactionRunner,
  type NewShopperAddress,
  type ShopperPatch,
  type Transaction,
} from '@lytronix/db';
import type { CustomerRecord } from '../../modules/customers/types/customers';
import type { ShopperStore } from '../../modules/shoppers/ports/shopper-store';
import type {
  ShopperAddressRecord,
  ShopperCodeRecord,
  ShopperRecord,
} from '../../modules/shoppers/types/shoppers';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleShopperStore implements ShopperStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ShopperRepository) private readonly shoppers: ShopperRepository,
    @Inject(CustomerRepository) private readonly customers: CustomerRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  latestCode(tx: Transaction, tenantId: string, phone: string): Promise<ShopperCodeRecord | null> {
    return this.shoppers.latestCode(tx, tenantId, phone);
  }

  countCodesSince(
    tx: Transaction,
    tenantId: string,
    phone: string | null,
    since: Date,
  ): Promise<number> {
    return this.shoppers.countCodesSince(tx, tenantId, phone, since);
  }

  insertCode(
    tx: Transaction,
    tenantId: string,
    values: { phone: string; codeHash: string; expiresAt: Date; createdAt: Date },
  ): Promise<ShopperCodeRecord> {
    return this.shoppers.insertCode(tx, tenantId, values);
  }

  recordWrongCode(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.shoppers.recordWrongCode(tx, tenantId, id);
  }

  useCode(tx: Transaction, tenantId: string, id: string, now: Date): Promise<void> {
    return this.shoppers.useCode(tx, tenantId, id, now);
  }

  deleteCode(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.shoppers.deleteCode(tx, tenantId, id);
  }

  findByPhone(tx: Transaction, tenantId: string, phone: string): Promise<ShopperRecord | null> {
    return this.shoppers.findByPhone(tx, tenantId, phone);
  }

  lock(tx: Transaction, tenantId: string, id: string): Promise<ShopperRecord | null> {
    return this.shoppers.lock(tx, tenantId, id);
  }

  insertShopper(
    tx: Transaction,
    tenantId: string,
    values: { phone: string; name: string; passwordHash: string },
  ): Promise<ShopperRecord | null> {
    return this.shoppers.insertShopper(tx, tenantId, values);
  }

  updateShopper(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ShopperPatch,
  ): Promise<ShopperRecord> {
    return this.shoppers.updateShopper(tx, tenantId, id, patch);
  }

  insertSession(
    tx: Transaction,
    tenantId: string,
    values: { shopperId: string; tokenHash: string; expiresAt: Date },
  ): Promise<string> {
    return this.shoppers.insertSession(tx, tenantId, values);
  }

  findSession(
    tx: Transaction,
    tenantId: string,
    tokenHash: string,
    now: Date,
  ): Promise<{ sessionId: string; shopper: ShopperRecord } | null> {
    return this.shoppers.findSession(tx, tenantId, tokenHash, now);
  }

  deleteSession(tx: Transaction, tenantId: string, sessionId: string): Promise<void> {
    return this.shoppers.deleteSession(tx, tenantId, sessionId);
  }

  deleteSessions(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
    keep: string | null,
  ): Promise<void> {
    return this.shoppers.deleteSessions(tx, tenantId, shopperId, keep);
  }

  listAddresses(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
  ): Promise<ShopperAddressRecord[]> {
    return this.shoppers.listAddresses(tx, tenantId, shopperId);
  }

  insertAddress(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
    values: NewShopperAddress,
  ): Promise<ShopperAddressRecord> {
    return this.shoppers.insertAddress(tx, tenantId, shopperId, values);
  }

  updateAddress(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<NewShopperAddress>,
  ): Promise<void> {
    return this.shoppers.updateAddress(tx, tenantId, id, patch);
  }

  clearDefault(tx: Transaction, tenantId: string, shopperId: string): Promise<void> {
    return this.shoppers.clearDefault(tx, tenantId, shopperId);
  }

  deleteAddress(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.shoppers.deleteAddress(tx, tenantId, id);
  }

  findCustomer(tx: Transaction, tenantId: string, id: string): Promise<CustomerRecord | null> {
    return this.customers.find(tx, tenantId, id);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.shoppers.deleteAllForTenant(tx, tenantId);
  }
}
