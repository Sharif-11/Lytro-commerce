import { Inject, Injectable } from '@nestjs/common';
import {
  AddonPurchaseRepository,
  ApiKeyRepository,
  ApiUsageRepository,
  PlanLimitOverridesRepository,
  TransactionRunner,
  type AddonUnits,
  type CyclePackFields,
  type Transaction,
} from '@lytronix/db';
import {
  totalOf,
  type ApiKeyStore,
  type ApiUsageStore,
} from '../../modules/public-api/ports/api-key-store';
import type {
  ApiKeyRecord,
  ApiShopRow,
  ApiUsageCounts,
  ApiUsageRow,
  NewApiKey,
} from '../../modules/public-api/types/public-api';
import type { UsageLimitKey } from '@lytronix/validators';
import { DatabaseService } from '../database.service';

/** control.api_keys (API-01 to API-05, API-08, API-23), and the shop a key belongs to with its overrides. */
@Injectable()
export class DrizzleApiKeyStore implements ApiKeyStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ApiKeyRepository) private readonly keys: ApiKeyRepository,
    @Inject(PlanLimitOverridesRepository) private readonly overrides: PlanLimitOverridesRepository,
    @Inject(AddonPurchaseRepository) private readonly addons: AddonPurchaseRepository,
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

  listAddonUnits(tenantId: string): Promise<AddonUnits[]> {
    return this.addons.activeUnits(this.database.handle.db, tenantId);
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
    @Inject(AddonPurchaseRepository) private readonly addons: AddonPurchaseRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  add(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    counts: ApiUsageCounts,
  ): Promise<ApiUsageRow> {
    return this.usage.add(tx, tenantId, cycleStart, counts);
  }

  find(tenantId: string, cycleStart: Date): Promise<ApiUsageRow | null> {
    return this.usage.find(this.database.handle.db, tenantId, cycleStart);
  }

  setWarned(tx: Transaction, tenantId: string, cycleStart: Date, percent: number): Promise<void> {
    return this.usage.setWarned(tx, tenantId, cycleStart, percent);
  }

  setFastSpendAlerted(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    at: Date,
  ): Promise<void> {
    return this.usage.setFastSpendAlerted(tx, tenantId, cycleStart, at);
  }

  updateCycle(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    values: Partial<CyclePackFields & { warnedPercent: number }>,
  ): Promise<void> {
    return this.usage.updateCycle(tx, tenantId, cycleStart, values);
  }

  lockCycle(tx: Transaction, tenantId: string, cycleStart: Date): Promise<ApiUsageRow> {
    return this.usage.lockCycle(tx, tenantId, cycleStart);
  }

  async packsBought(tenantId: string, tx?: Transaction): Promise<number> {
    const db = tx ?? this.database.handle.db;
    return totalOf(await this.addons.packTotals(db, REQUESTS_LIMIT_KEY, tenantId));
  }

  async packsTaken(tenantId: string, tx?: Transaction): Promise<number> {
    return totalOf(await this.usage.packUsedTotals(tx ?? this.database.handle.db, tenantId));
  }
}

// RTE-11: the limit a request pack tops up.
const REQUESTS_LIMIT_KEY: UsageLimitKey = 'requests_monthly';
