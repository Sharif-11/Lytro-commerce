import type {
  CatalogueVersions,
  FeedAttributeRow,
  FeedImageRow,
  FeedVariantRow,
  PublicProductFilter,
  PublicProductRow,
  Transaction,
} from '@lytronix/db';
import type { CategoryRecord } from '../../catalogue/types/catalogue';

/** CCH-02, LND-04, PRD-03: what the public catalogue reads besides its product lists. */
export interface PublicCatalogueStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The shop's catalogue version and the platform library's. */
  versions(tx: Transaction, tenantId: string): Promise<CatalogueVersions>;
  /** The active product a link names, by its current slug or an old one, with its current slug. */
  findBySlug(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ productId: string; slug: string } | null>;
  listCategories(tx: Transaction, tenantId: string): Promise<CategoryRecord[]>;
  /** FED-01, FED-02: every variant on sale of every active product, its photos, and the named attributes' values. */
  listFeedVariants(tx: Transaction, tenantId: string): Promise<FeedVariantRow[]>;
  listFeedImages(tx: Transaction, tenantId: string): Promise<FeedImageRow[]>;
  listFeedAttributes(
    tx: Transaction,
    tenantId: string,
    names: readonly string[],
  ): Promise<FeedAttributeRow[]>;
}

/**
 * CCH-12: the one search interface. Every public product list goes through it, searching or not, so a separate
 * engine, if ever needed, replaces this alone. PostgreSQL's full-text and trigram indexes serve it today.
 */
export interface CatalogueSearch {
  listProducts(
    tx: Transaction,
    tenantId: string,
    filter: PublicProductFilter,
  ): Promise<PublicProductRow[]>;
}
