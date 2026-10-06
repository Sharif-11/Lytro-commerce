import { Inject, Injectable } from '@nestjs/common';
import {
  SlugRepository,
  TenantRepository,
  TRIAL_PLAN_NAME,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import type { PlanLimits } from '@lytronix/validators';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { CachedTenant } from '../../modules/tenancy/types/cached-tenant';
import type { TenantDirectory } from '../../modules/tenancy/ports/tenant-directory';
import type { SlugAvailability } from '../../modules/tenancy/ports/slug-availability';
import type { TenantSummaryStore } from '../../modules/tenancy/ports/tenant-summary-store';
import type { TenantSummary } from '../../modules/tenancy/types/tenant-summary';
import type { TenantStore } from '../../modules/tenancy/ports/tenant-store';
import { DatabaseService } from '../database.service';

/** Host lookups for the resolver (TEN-7a). */
@Injectable()
export class DrizzleTenantDirectory implements TenantDirectory {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  findBySlug(slug: string): Promise<CachedTenant | null> {
    return this.tenants.findBySlug(this.database.handle.db, slug);
  }

  findByActiveDomain(hostname: string): Promise<CachedTenant | null> {
    return this.tenants.findByActiveDomain(this.database.handle.db, hostname);
  }
}

/** Slug availability: taken by a shop, or reserved (AUTH-11, TEN-26). */
@Injectable()
export class DrizzleSlugAvailability implements SlugAvailability {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(SlugRepository) private readonly slugs: SlugRepository,
  ) {}

  findUnavailable(slugs: string[]): Promise<Set<string>> {
    return this.slugs.findUnavailable(this.database.handle.db, slugs);
  }
}

/** Shop rows, written inside the caller's transaction. A duplicate address becomes UniqueViolation('address'). */
@Injectable()
export class DrizzleTenantStore implements TenantStore {
  constructor(
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
  ) {}

  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null> {
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

/** Shop summaries for the dashboard (AUTH-22, AUTH-23). */
@Injectable()
export class DrizzleTenantSummaryStore implements TenantSummaryStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  findSummary(tenantId: string): Promise<TenantSummary | null> {
    return this.tenants.findSummaryById(this.database.handle.db, tenantId);
  }
}
