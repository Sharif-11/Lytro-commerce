import { Inject, Injectable } from '@nestjs/common';
import {
  AdTrackingRepository,
  CatalogFeedRepository,
  TransactionRunner,
  type SelectAdTrackingSettings,
  type SelectCatalogFeed,
  type Transaction,
} from '@lytronix/db';
import type {
  AdTrackingStore,
  CatalogFeedStore,
} from '../../modules/public-api/ports/ad-tracking-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleAdTrackingStore implements AdTrackingStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(AdTrackingRepository) private readonly settings: AdTrackingRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  find(tx: Transaction, tenantId: string): Promise<SelectAdTrackingSettings | null> {
    return this.settings.find(tx, tenantId);
  }

  lock(tx: Transaction, tenantId: string): Promise<SelectAdTrackingSettings | null> {
    return this.settings.lock(tx, tenantId);
  }

  save(
    tx: Transaction,
    values: { tenantId: string; metaPixelId: string | null; metaCapiTokenEnc: Buffer | null },
  ): Promise<SelectAdTrackingSettings> {
    return this.settings.save(tx, values);
  }

  delete(tx: Transaction, tenantId: string): Promise<void> {
    return this.settings.delete(tx, tenantId);
  }
}

@Injectable()
export class DrizzleCatalogFeedStore implements CatalogFeedStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CatalogFeedRepository) private readonly feeds: CatalogFeedRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  findByHash(tokenHash: Buffer): Promise<string | null> {
    return this.feeds.findByHash(this.database.handle.db, tokenHash);
  }

  findForTenant(tenantId: string): Promise<SelectCatalogFeed | null> {
    return this.feeds.findForTenant(this.database.handle.db, tenantId);
  }

  insertFirst(values: {
    tenantId: string;
    tokenHash: Buffer;
    tokenEnc: Buffer;
  }): Promise<SelectCatalogFeed> {
    return this.feeds.insertFirst(this.database.handle.db, values);
  }

  replace(
    tx: Transaction,
    values: { tenantId: string; tokenHash: Buffer; tokenEnc: Buffer },
  ): Promise<SelectCatalogFeed> {
    return this.feeds.replace(tx, values);
  }

  deleteForTenant(tenantId: string): Promise<void> {
    return this.feeds.deleteForTenant(this.database.handle.db, tenantId);
  }
}
