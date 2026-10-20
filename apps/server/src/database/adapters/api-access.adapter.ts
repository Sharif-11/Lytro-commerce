import { Inject, Injectable } from '@nestjs/common';
import {
  ApiKeyRepository,
  ApiUsageRepository,
  PlanLimitOverridesRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import type { ApiKeyStore, ApiUsageStore } from '../../modules/api-access/ports/api-key-store';
import type {
  ApiKeyRecord,
  ApiShopRow,
  ApiUsageRow,
  NewApiKey,
} from '../../modules/api-access/types/api-access';
import { DatabaseService } from '../database.service';

/** control.api_keys (API-01 to API-05, API-08, API-23), and the shop a key belongs to with its overrides. */
@Injectable()
export class DrizzleApiKeyStore implements ApiKeyStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ApiKeyRepository) private readonly keys: ApiKeyRepository,
    @Inject(PlanLimitOverridesRepository) private readonly overrides: PlanLimitOverridesRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insert(tx: Transaction, row: NewApiKey): Promise<ApiKeyRecord> {
    return this.keys.insert(tx, row);
  }

  listForTenant(tenantId: string): Promise<ApiKeyRecord[]> {
    return this.keys.listForTenant(this.database.handle.db, tenantId);
  }

  findForTenant(tx: Transaction, tenantId: string, id: string): Promise<ApiKeyRecord | null> {
    return this.keys.findForTenant(tx, tenantId, id);
  }

  lockAndCountLive(tx: Transaction, tenantId: string, now: Date): Promise<number> {
    return this.keys.lockAndCountLive(tx, tenantId, now);
  }

  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; websites?: string[] },
  ): Promise<ApiKeyRecord | null> {
    return this.keys.update(tx, tenantId, id, patch);
  }

  revoke(
    tx: Transaction,
    tenantId: string,
    id: string,
    by: string | null,
    at: Date,
  ): Promise<ApiKeyRecord | null> {
    return this.keys.revoke(tx, tenantId, id, by, at);
  }

  findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.keys.findByHash(this.database.handle.db, keyHash);
  }

  touchLastUsed(id: string, at: Date): Promise<void> {
    return this.keys.touchLastUsed(this.database.handle.db, id, at);
  }

  isOriginRegistered(origin: string, now: Date): Promise<boolean> {
    return this.keys.isOriginRegistered(this.database.handle.db, origin, now);
  }

  findShop(tenantId: string): Promise<ApiShopRow | null> {
    return this.keys.findShop(this.database.handle.db, tenantId);
  }

  async listOverrides(tenantId: string): Promise<{ limitKey: string; value: unknown }[]> {
    return this.overrides.listForTenant(this.database.handle.db, tenantId);
  }

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.keys.deleteAllForTenant(this.database.handle.db, tenantId);
  }
}

/** control.api_usage (RTE-03, D3-2). */
@Injectable()
export class DrizzleApiUsageStore implements ApiUsageStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ApiUsageRepository) private readonly usage: ApiUsageRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  add(tx: Transaction, tenantId: string, cycleStart: Date, requests: number): Promise<ApiUsageRow> {
    return this.usage.add(tx, tenantId, cycleStart, requests);
  }

  find(tenantId: string, cycleStart: Date): Promise<ApiUsageRow | null> {
    return this.usage.find(this.database.handle.db, tenantId, cycleStart);
  }

  setWarned(tx: Transaction, tenantId: string, cycleStart: Date, percent: number): Promise<void> {
    return this.usage.setWarned(tx, tenantId, cycleStart, percent);
  }
}
