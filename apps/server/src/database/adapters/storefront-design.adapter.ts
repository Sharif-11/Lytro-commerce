import { Inject, Injectable } from '@nestjs/common';
import {
  MediaRepository,
  StorefrontDesignRepository,
  TransactionRunner,
  type StorefrontDesignValues,
  type Transaction,
} from '@lytronix/db';
import { MediaKind } from '@lytronix/validators';
import type { StorefrontDesignStore } from '../../modules/storefront-design/ports/storefront-design-store';
import type {
  StorefrontDesignRecord,
  StorefrontSale,
  StorefrontTarget,
} from '../../modules/storefront-design/types/storefront-design';
import { DatabaseService } from '../database.service';

/** tenant.storefront_designs, the shop's type, what a design names, and its photos' sizes (SB-11 to SB-16). */
@Injectable()
export class DrizzleStorefrontDesignStore implements StorefrontDesignStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(StorefrontDesignRepository) private readonly designs: StorefrontDesignRepository,
    @Inject(MediaRepository) private readonly media: MediaRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  find(tx: Transaction, tenantId: string): Promise<StorefrontDesignRecord | null> {
    return this.designs.get(tx, tenantId);
  }

  lock(tx: Transaction, tenantId: string): Promise<StorefrontDesignRecord> {
    return this.designs.lock(tx, tenantId);
  }

  write(
    tx: Transaction,
    tenantId: string,
    values: StorefrontDesignValues,
  ): Promise<StorefrontDesignRecord> {
    return this.designs.write(tx, tenantId, values);
  }

  deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.designs.deleteForTenant(tx, tenantId);
  }

  businessType(tx: Transaction, tenantId: string): Promise<string | null> {
    return this.designs.businessType(tx, tenantId);
  }

  targets(
    tx: Transaction,
    tenantId: string,
    categoryIds: readonly string[],
    productIds: readonly string[],
  ): Promise<{ categories: StorefrontTarget[]; products: StorefrontTarget[] }> {
    return this.designs.targets(tx, tenantId, categoryIds, productIds);
  }

  sale(tx: Transaction, tenantId: string): Promise<StorefrontSale> {
    return this.designs.sale(tx, tenantId);
  }

  async photoWidths(
    tx: Transaction,
    tenantId: string,
    ids: readonly string[],
  ): Promise<Map<string, number | null>> {
    const wanted = [...new Set(ids)];
    // In turn: the transaction's one connection runs one query at a time.
    const ready = await this.media.readyMedia(tx, tenantId, wanted, MediaKind.Image);
    const sizes = await this.media.sizesOf(
      tx,
      tenantId,
      ready.map((row) => row.id),
    );
    return new Map(sizes.map((size) => [size.id, size.width]));
  }
}
