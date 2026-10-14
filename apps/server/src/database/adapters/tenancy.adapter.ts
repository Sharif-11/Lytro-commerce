import { Inject, Injectable } from '@nestjs/common';
import {
  PAYG_PLAN_NAME,
  SlugRepository,
  TenantRepository,
  TRIAL_PLAN_NAME,
  TransactionRunner,
  type BalanceRow,
  type BillingInfoRow,
  type LapsingCandidateRow,
  type PaygCandidateRow,
  type Transaction,
} from '@lytronix/db';
import type { PlanLimits, TenantState } from '@lytronix/validators';
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
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null> {
    return this.tenants.findPlanByName(tx, TRIAL_PLAN_NAME, false);
  }

  findPayAsYouGoPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null> {
    return this.tenants.findPlanByName(tx, PAYG_PLAN_NAME, false);
  }

  findExpiredTrialIds(tx: Transaction, now: Date): Promise<string[]> {
    return this.tenants.findExpiredTrialIds(tx, now);
  }

  findBillingInfo(tx: Transaction, tenantId: string): Promise<BillingInfoRow | null> {
    return this.tenants.findBillingInfo(tx, tenantId);
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

  lockBalanceForUpdate(tx: Transaction, tenantId: string): Promise<BalanceRow | null> {
    return this.tenants.lockBalanceForUpdate(tx, tenantId);
  }

  setBalanceFrozen(tx: Transaction, tenantId: string, frozen: boolean): Promise<void> {
    return this.tenants.setBalanceFrozen(tx, tenantId, frozen);
  }

  applyPlanAssignment(
    tx: Transaction,
    tenantId: string,
    values: Parameters<TenantStore['applyPlanAssignment']>[2],
  ): Promise<void> {
    return this.tenants.applyPlanAssignment(tx, tenantId, values);
  }

  applyBalanceChange(
    tx: Transaction,
    tenantId: string,
    amount: string,
    options?: { frozen?: boolean; touchActivityAt?: Date },
  ): Promise<void> {
    return this.tenants.applyBalanceChange(tx, tenantId, amount, options);
  }

  setLifecycleState(tx: Transaction, tenantId: string, state: TenantState): Promise<void> {
    return this.tenants.setLifecycleState(tx, tenantId, state);
  }

  setSuspension(tx: Transaction, tenantId: string, reason: string, at: Date): Promise<void> {
    return this.tenants.setSuspension(tx, tenantId, reason, at);
  }

  clearSuspension(tx: Transaction, tenantId: string): Promise<void> {
    return this.tenants.clearSuspension(tx, tenantId);
  }

  setCancellation(tx: Transaction, tenantId: string, cancelledAt: Date | null): Promise<void> {
    return this.tenants.setCancellation(tx, tenantId, cancelledAt);
  }

  markDeleted(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    return this.tenants.markDeleted(tx, tenantId, at);
  }

  findLapsingCandidates(tx: Transaction, now: Date): Promise<LapsingCandidateRow[]> {
    return this.tenants.findLapsingCandidates(tx, now);
  }

  findPaygInactiveCandidates(tx: Transaction): Promise<PaygCandidateRow[]> {
    return this.tenants.findPaygInactiveCandidates(tx);
  }

  findPaygArchivedCandidates(tx: Transaction): Promise<PaygCandidateRow[]> {
    return this.tenants.findPaygArchivedCandidates(tx);
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
