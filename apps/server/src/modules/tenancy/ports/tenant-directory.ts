import type { CachedTenant } from '../types/cached-tenant';

// The database lookups the resolver needs. Implemented in database/adapters, so the resolver can be tested with a fake.
export interface TenantDirectory {
  findBySlug(slug: string): Promise<CachedTenant | null>;
  findByActiveDomain(hostname: string): Promise<CachedTenant | null>;
}
