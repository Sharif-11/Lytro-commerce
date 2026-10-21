import { Inject, Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import type { CatalogueVersions } from '@lytronix/db';
import type { PublicCatalogueStore } from '../ports/public-catalogue-store';
import { CATALOGUE_CACHE_SETTINGS, PUBLIC_CATALOGUE_STORE } from '../tokens';
import type { CatalogueCacheSettings } from './catalogue-cache';

const VERSIONS_KEPT = 10_000;

/**
 * CCH-02, CCH-04: each shop's current catalogue versions, read again at most every two seconds, so the cache keys
 * follow every edit within that. Shops asked for together wait for one read.
 */
@Injectable()
export class CatalogueVersionReader {
  private readonly versions: LRUCache<string, CatalogueVersions>;

  constructor(
    @Inject(PUBLIC_CATALOGUE_STORE) store: PublicCatalogueStore,
    @Inject(CATALOGUE_CACHE_SETTINGS) settings: CatalogueCacheSettings,
  ) {
    this.versions = new LRUCache<string, CatalogueVersions>({
      max: VERSIONS_KEPT,
      ttl: Math.max(settings.versionMs, 1),
      fetchMethod: (tenantId) => store.run((tx) => store.versions(tx, tenantId)),
    });
  }

  async current(tenantId: string): Promise<CatalogueVersions> {
    const versions = await this.versions.fetch(tenantId);
    if (!versions) throw new Error(`no catalogue versions for ${tenantId}`);
    return versions;
  }
}
