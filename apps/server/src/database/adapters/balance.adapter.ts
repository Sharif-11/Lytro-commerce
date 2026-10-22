import { Inject, Injectable } from '@nestjs/common';
import {
  BalanceLedgerRepository,
  PlatformWalletsRepository,
  RatesRepository,
  ShopSettingsRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import type { RateKey } from '@lytronix/validators';
import type {
  BalanceLedgerStore,
  LedgerFilters,
  NewLedgerEntry,
} from '../../modules/balance/ports/balance-ledger-store';
import type {
  NewPlatformWalletValues,
  PlatformWalletsStore,
  UpdatePlatformWalletValues,
} from '../../modules/balance/ports/platform-wallets-store';
import type { RateStore } from '../../modules/balance/ports/rate-store';
import type { ShopSettingsStore } from '../../modules/balance/ports/shop-settings-store';
import type { LedgerEntry } from '../../modules/balance/types/ledger-entry';
import type { PlatformWallet } from '../../modules/balance/types/platform-wallet';
import type { RateHistoryEntry, RateValue } from '../../modules/balance/types/rate';
import { DatabaseService } from '../database.service';

/** Database-backed balance ledger (BAL-02). Every method runs inside a transaction carrying the tenant context. */
@Injectable()
export class DrizzleBalanceLedgerStore implements BalanceLedgerStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(BalanceLedgerRepository) private readonly ledger: BalanceLedgerRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async insert(tx: Transaction, entry: NewLedgerEntry): Promise<LedgerEntry> {
    const row = await this.ledger.insert(tx, {
      tenantId: entry.tenantId,
      type: entry.type,
      amount: entry.amount,
      units: entry.units ?? null,
      rateUsed: entry.rateUsed ?? null,
      reference: entry.reference ?? null,
    });
    return row;
  }

  list(
    tx: Transaction,
    tenantId: string,
    filters: LedgerFilters,
    cursor: number | null,
    limit: number,
  ): Promise<LedgerEntry[]> {
    return this.ledger.list(tx, tenantId, filters, cursor ? { id: cursor } : null, limit);
  }
}

/** Database-backed rates (RAT-01..14). Platform-wide, no tenant context needed. */
@Injectable()
export class DrizzleRateStore implements RateStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(RatesRepository) private readonly rates: RatesRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async get(key: RateKey): Promise<RateValue | null> {
    const row = await this.rates.get(this.database.handle.db, key);
    return row ? { key: row.key, value: row.value, effectiveFrom: row.effectiveFrom } : null;
  }

  async list(): Promise<RateValue[]> {
    const rows = await this.rates.list(this.database.handle.db);
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      effectiveFrom: row.effectiveFrom,
    }));
  }

  set(
    tx: Transaction,
    key: RateKey,
    oldValue: string | null,
    newValue: string,
    changedBy: string | null,
    noticeId: string | null,
  ): Promise<void> {
    return this.rates.set(tx, key, oldValue, newValue, changedBy, noticeId);
  }

  async history(key: RateKey): Promise<RateHistoryEntry[]> {
    const rows = await this.rates.history(this.database.handle.db, key);
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      oldValue: row.oldValue,
      newValue: row.newValue,
      changedBy: row.changedBy,
      noticeId: row.noticeId,
      changedAt: row.changedAt,
    }));
  }
}

/** Database-backed platform wallet numbers (BIL-02/BAL-03). Platform-wide, no tenant context. */
@Injectable()
export class DrizzlePlatformWalletsStore implements PlatformWalletsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlatformWalletsRepository) private readonly wallets: PlatformWalletsRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(enabledOnly: boolean): Promise<PlatformWallet[]> {
    return this.wallets.list(this.database.handle.db, enabledOnly);
  }

  create(tx: Transaction, values: NewPlatformWalletValues): Promise<PlatformWallet> {
    return this.wallets.insert(tx, values);
  }

  update(
    tx: Transaction,
    id: string,
    values: UpdatePlatformWalletValues,
  ): Promise<PlatformWallet | null> {
    return this.wallets.update(tx, id, values);
  }

  remove(tx: Transaction, id: string): Promise<void> {
    return this.wallets.remove(tx, id);
  }
}

/** Database-backed per-tenant shop settings (RAT-14). */
@Injectable()
export class DrizzleShopSettingsStore implements ShopSettingsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ShopSettingsRepository) private readonly settings: ShopSettingsRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async get(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ extraDeliveryChargePerKg: string; linkSharedAt: Date | null } | null> {
    const row = await this.settings.get(tx, tenantId);
    return row
      ? { extraDeliveryChargePerKg: row.extraDeliveryChargePerKg, linkSharedAt: row.linkSharedAt }
      : null;
  }

  set(tx: Transaction, tenantId: string, extraDeliveryChargePerKg: string): Promise<void> {
    return this.settings.set(tx, tenantId, extraDeliveryChargePerKg);
  }

  markLinkShared(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    return this.settings.markLinkShared(tx, tenantId, at);
  }
}
