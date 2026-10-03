// Public entry point of the database package. Consumers import from '@lytronix/db' only.
export * from './schema';
export { createDatabase, type Database, type DatabaseHandle } from './client';
export { runMigrations } from './migrate';
export {
  findTenantByActiveDomain,
  findTenantBySlug,
  type TenantLookupRow,
} from './repositories/tenancy/tenant-lookup';
export { findUnavailableSlugs } from './repositories/tenancy/slug-availability';
