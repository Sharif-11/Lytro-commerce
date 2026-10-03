import {
  findTenantByActiveDomain,
  findTenantBySlug,
  findUnavailableSlugs,
  type Database,
} from '@lytronix/db';
import type { SlugAvailability } from './slug.service';
import type { CachedTenant } from './tenant-cache';
import type { TenantDirectory } from './tenant-resolver.service';

/** The database-backed directory. Only this class knows about Drizzle; the resolver sees the interface. */
export class DrizzleTenantDirectory implements TenantDirectory {
  constructor(private readonly db: Database) {}

  findBySlug(slug: string): Promise<CachedTenant | null> {
    return findTenantBySlug(this.db, slug);
  }

  findByActiveDomain(hostname: string): Promise<CachedTenant | null> {
    return findTenantByActiveDomain(this.db, hostname);
  }
}

/** Slug availability over the database: a slug is unavailable when a shop holds it or it is reserved. */
export class DrizzleSlugAvailability implements SlugAvailability {
  constructor(private readonly db: Database) {}

  findUnavailable(slugs: string[]): Promise<Set<string>> {
    return findUnavailableSlugs(this.db, slugs);
  }
}
