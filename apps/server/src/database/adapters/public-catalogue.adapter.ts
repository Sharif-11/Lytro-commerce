import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryRepository,
  ComboRepository,
  PublicCatalogueRepository,
  type ComboPartStockRow,
  TransactionRunner,
  type CatalogueVersions,
  type CategoryProductCount,
  type FeedAttributeRow,
  type FeedImageRow,
  type FeedVariantRow,
  type PublicProductFilter,
  type PublicProductRow,
  type PublicSwatchRow,
  type Transaction,
} from '@lytronix/db';
import type { CategoryRecord } from '../../modules/catalogue/types/catalogue';
import type {
  CatalogueSearch,
  PublicCatalogueStore,
} from '../../modules/public-api/ports/public-catalogue-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePublicCatalogueStore implements PublicCatalogueStore {
  constructor(
    @Inject(DatabaseService)
    private readonly database: Pick<DatabaseService, 'reads' | 'readRetrying'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PublicCatalogueRepository) private readonly catalogue: PublicCatalogueRepository,
    @Inject(CategoryRepository) private readonly categories: CategoryRepository,
    @Inject(ComboRepository) private readonly combos: ComboRepository,
  ) {}

  /**
   * D9-13 (Slice 9.2's read: the storefront and the public API first): every read of the public catalogue runs on the
   * read pool, as the read-only role, inside its own read-only transaction that still sets the shop for row-level
   * security. Nothing here writes (read-pool-reads.spec.ts checks the code; the role refuses at run time), so a read
   * whose connection was lost is safely tried once more (DAT-23).
   */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.database.readRetrying(() => this.transactions.run(this.database.reads.db, work));
  }

  versions(tx: Transaction, tenantId: string): Promise<CatalogueVersions> {
    return this.catalogue.versions(tx, tenantId);
  }

  findBySlug(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ productId: string; slug: string } | null> {
    return this.catalogue.findBySlug(tx, tenantId, slug);
  }

  listCategories(tx: Transaction, tenantId: string): Promise<CategoryRecord[]> {
    return this.categories.listCategories(tx, tenantId);
  }

  listComboPartStock(
    tx: Transaction,
    tenantId: string,
    comboIds: string[],
  ): Promise<ComboPartStockRow[]> {
    return this.combos.listPartStock(tx, tenantId, comboIds);
  }

  shopperVariantLabels(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, string>> {
    return this.combos.variantLabels(tx, tenantId, variantIds, false);
  }

  countCategoryProducts(tx: Transaction, tenantId: string): Promise<CategoryProductCount[]> {
    return this.catalogue.countCategoryProducts(tx, tenantId);
  }

  listSwatches(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<PublicSwatchRow[]> {
    return this.catalogue.listSwatches(tx, tenantId, productIds);
  }

  listFeedVariants(tx: Transaction, tenantId: string): Promise<FeedVariantRow[]> {
    return this.catalogue.listFeedVariants(tx, tenantId);
  }

  listFeedImages(tx: Transaction, tenantId: string): Promise<FeedImageRow[]> {
    return this.catalogue.listFeedImages(tx, tenantId);
  }

  listFeedAttributes(
    tx: Transaction,
    tenantId: string,
    names: readonly string[],
  ): Promise<FeedAttributeRow[]> {
    return this.catalogue.listFeedAttributes(tx, tenantId, names);
  }
}

/** CCH-12: the catalogue search on PostgreSQL's own full-text and trigram indexes. */
@Injectable()
export class PostgresCatalogueSearch implements CatalogueSearch {
  constructor(
    @Inject(PublicCatalogueRepository) private readonly catalogue: PublicCatalogueRepository,
  ) {}

  listProducts(
    tx: Transaction,
    tenantId: string,
    filter: PublicProductFilter,
  ): Promise<PublicProductRow[]> {
    return this.catalogue.listProducts(tx, tenantId, filter);
  }
}
