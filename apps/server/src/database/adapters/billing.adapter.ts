import { Inject, Injectable } from '@nestjs/common';
import {
  BillingTermsRepository,
  PAYG_PLAN_NAME,
  PlanAssignmentsRepository,
  PlanLimitOverridesRepository,
  PlanPricesRepository,
  PlansRepository,
  ScheduledPlanChangesRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type {
  BillingTermEditValues,
  BillingTermsStore,
  NewBillingTermValues,
} from '../../modules/billing/ports/billing-terms-store';
import type { PlanAssignmentsStore } from '../../modules/billing/ports/plan-assignments-store';
import type { PlanLimitOverridesStore } from '../../modules/billing/ports/plan-limit-overrides-store';
import type {
  NewPlanValues,
  PlanEditValues,
  PlansStore,
} from '../../modules/billing/ports/plans-store';
import type {
  NewScheduledPlanChangeValues,
  ScheduledPlanChangesStore,
} from '../../modules/billing/ports/scheduled-plan-changes-store';
import { DatabaseService } from '../database.service';

const PLAN_RANK_INDEX = 'plans_rank_for_sale_idx';

/** control.plans / control.plan_versions (PLN-01 to PLN-12, PLN-16). */
@Injectable()
export class DrizzlePlansStore implements PlansStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlansRepository) private readonly plans: PlansRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async create(tx: Transaction, values: NewPlanValues) {
    try {
      return await this.plans.insert(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, PLAN_RANK_INDEX))
        throw new UniqueViolation('rank');
      throw error;
    }
  }

  findById(tx: Transaction, id: string) {
    return this.plans.findById(tx, id);
  }

  listForSale(tx: Transaction) {
    return this.plans.listForSale(tx);
  }

  listAll(tx: Transaction) {
    return this.plans.listAll(tx);
  }

  async findPayAsYouGo(tx: Transaction) {
    const plans = await this.plans.listAll(tx);
    return plans.find((plan) => plan.name === PAYG_PLAN_NAME) ?? null;
  }

  async update(tx: Transaction, id: string, edit: PlanEditValues) {
    try {
      return await this.plans.update(tx, id, edit);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, PLAN_RANK_INDEX))
        throw new UniqueViolation('rank');
      throw error;
    }
  }

  isReferenced(tx: Transaction, id: string) {
    return this.plans.isReferenced(tx, id);
  }

  delete(tx: Transaction, id: string) {
    return this.plans.delete(tx, id);
  }

  listVersions(tx: Transaction, planId: string) {
    return this.plans.listVersions(tx, planId);
  }
}

/** control.billing_terms / control.plan_prices (TRM-01 to TRM-16). */
@Injectable()
export class DrizzleBillingTermsStore implements BillingTermsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(BillingTermsRepository) private readonly terms: BillingTermsRepository,
    @Inject(PlanPricesRepository) private readonly prices: PlanPricesRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  create(tx: Transaction, values: NewBillingTermValues) {
    return this.terms.insert(tx, values);
  }

  findById(tx: Transaction, id: string) {
    return this.terms.findById(tx, id);
  }

  listVisibleFor(tx: Transaction, tenantId: string | null) {
    return this.terms.listVisibleFor(tx, tenantId);
  }

  listAll(tx: Transaction) {
    return this.terms.listAll(tx);
  }

  update(tx: Transaction, id: string, edit: BillingTermEditValues) {
    return this.terms.update(tx, id, edit);
  }

  retire(tx: Transaction, id: string, at: Date) {
    return this.terms.retire(tx, id, at);
  }

  isUsed(tx: Transaction, id: string) {
    return this.terms.isUsed(tx, id);
  }

  delete(tx: Transaction, id: string) {
    return this.terms.delete(tx, id);
  }

  setPrice(tx: Transaction, planId: string, billingTermId: string, price: string) {
    return this.prices.set(tx, planId, billingTermId, price);
  }

  listPricesForPlan(tx: Transaction, planId: string) {
    return this.prices.listForPlan(tx, planId);
  }

  removePrice(tx: Transaction, planId: string, billingTermId: string) {
    return this.prices.remove(tx, planId, billingTermId);
  }
}

/** control.plan_assignments (PLN-17/18). */
@Injectable()
export class DrizzlePlanAssignmentsStore implements PlanAssignmentsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlanAssignmentsRepository) private readonly assignments: PlanAssignmentsRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insert(tx: Transaction, values: Parameters<PlanAssignmentsStore['insert']>[1]) {
    return this.assignments.insert(tx, values);
  }
}

/** control.plan_limit_overrides (PLN-11). */
@Injectable()
export class DrizzlePlanLimitOverridesStore implements PlanLimitOverridesStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlanLimitOverridesRepository) private readonly overrides: PlanLimitOverridesRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  set(tx: Transaction, values: Parameters<PlanLimitOverridesStore['set']>[1]) {
    return this.overrides.set(tx, values);
  }

  listForTenant(tx: Transaction, tenantId: string) {
    return this.overrides.listForTenant(tx, tenantId);
  }

  remove(tx: Transaction, tenantId: string, limitKey: string) {
    return this.overrides.remove(tx, tenantId, limitKey);
  }
}

/** control.scheduled_plan_changes (DWN-01/04, UPG-13). */
@Injectable()
export class DrizzleScheduledPlanChangesStore implements ScheduledPlanChangesStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ScheduledPlanChangesRepository)
    private readonly changes: ScheduledPlanChangesRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  upsert(tx: Transaction, values: NewScheduledPlanChangeValues) {
    return this.changes.upsert(tx, values);
  }

  findByTenant(tx: Transaction, tenantId: string) {
    return this.changes.findByTenant(tx, tenantId);
  }

  delete(tx: Transaction, tenantId: string) {
    return this.changes.delete(tx, tenantId);
  }

  findDue(tx: Transaction, now: Date) {
    return this.changes.findDue(tx, now);
  }
}
