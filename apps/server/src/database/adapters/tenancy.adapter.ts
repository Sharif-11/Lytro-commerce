import {
  findPlanByName,
  findTenantByActiveDomain,
  findTenantBySlug,
  findUnavailableSlugs,
  insertTenant,
  isUniqueViolation,
  type Database,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { CachedTenant } from '../../tenancy/services/tenant-cache';
import type { TenantDirectory } from '../../tenancy/services/tenant-resolver.service';
import type { SlugAvailability } from '../../tenancy/services/slug.service';
import type { TenantStore } from '../../tenancy/services/tenant.service';

/** Host lookups for the resolver (TEN-7a). */
export class DrizzleTenantDirectory implements TenantDirectory {
  constructor(private readonly db: Database) {}

  findBySlug(slug: string): Promise<CachedTenant | null> {
    return findTenantBySlug(this.db, slug);
  }

  findByActiveDomain(hostname: string): Promise<CachedTenant | null> {
    return findTenantByActiveDomain(this.db, hostname);
  }
}

/** Slug availability: taken by a shop, or reserved (AUTH-11, TEN-26). */
export class DrizzleSlugAvailability implements SlugAvailability {
  constructor(private readonly db: Database) {}

  findUnavailable(slugs: string[]): Promise<Set<string>> {
    return findUnavailableSlugs(this.db, slugs);
  }
}

/** Shop rows, written inside the caller's transaction. A duplicate address becomes UniqueViolation('address'). */
export class DrizzleTenantStore implements TenantStore {
  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: unknown } | null> {
    return findPlanByName(tx, 'Trial', false);
  }

  async insertTenant(
    tx: Transaction,
    values: Parameters<TenantStore['insertTenant']>[1],
  ): Promise<string> {
    try {
      return await insertTenant(tx, values);
    } catch (error) {
      if (isUniqueViolation(error, 'tenants_slug')) throw new UniqueViolation('address');
      throw error;
    }
  }
}
