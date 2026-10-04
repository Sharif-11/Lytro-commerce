import {
  SlugRepository,
  TenantRepository,
  TRIAL_PLAN_NAME,
  TransactionRunner,
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
  private readonly tenants = new TenantRepository();

  constructor(private readonly db: Database) {}

  findBySlug(slug: string): Promise<CachedTenant | null> {
    return this.tenants.findBySlug(this.db, slug);
  }

  findByActiveDomain(hostname: string): Promise<CachedTenant | null> {
    return this.tenants.findByActiveDomain(this.db, hostname);
  }
}

/** Slug availability: taken by a shop, or reserved (AUTH-11, TEN-26). */
export class DrizzleSlugAvailability implements SlugAvailability {
  private readonly slugs = new SlugRepository();

  constructor(private readonly db: Database) {}

  findUnavailable(slugs: string[]): Promise<Set<string>> {
    return this.slugs.findUnavailable(this.db, slugs);
  }
}

/** Shop rows, written inside the caller's transaction. A duplicate address becomes UniqueViolation('address'). */
export class DrizzleTenantStore implements TenantStore {
  private readonly tenants = new TenantRepository();
  private readonly transactions = new TransactionRunner();

  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: unknown } | null> {
    return this.tenants.findPlanByName(tx, TRIAL_PLAN_NAME, false);
  }

  async insertTenant(
    tx: Transaction,
    values: Parameters<TenantStore['insertTenant']>[1],
  ): Promise<string> {
    try {
      return await this.tenants.insert(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, 'tenants_slug')) {
        throw new UniqueViolation('address');
      }
      throw error;
    }
  }
}
