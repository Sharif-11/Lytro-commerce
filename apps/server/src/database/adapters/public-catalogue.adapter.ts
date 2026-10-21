import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryRepository,
  PublicCatalogueRepository,
  TransactionRunner,
  type CatalogueVersions,
  type FeedAttributeRow,
  type FeedImageRow,
  type FeedVariantRow,
  type PublicProductFilter,
  type PublicProductRow,
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
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PublicCatalogueRepository) private readonly catalogue: PublicCatalogueRepository,
    @Inject(CategoryRepository) private readonly categories: CategoryRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
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
