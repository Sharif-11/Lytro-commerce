import { findTenantByActiveDomain, findTenantBySlug, type Database } from '@lytronix/db';
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
