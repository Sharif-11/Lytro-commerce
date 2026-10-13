import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { NewPlanValues, PlanEditValues, PlansStore } from '../ports/plans-store';
import { PLANS_STORE } from '../tokens';
import type { PlanRecord, PlanVersionRecord } from '../types/plan';

/** control.plans and control.plan_versions (PLN-01 to PLN-12, PLN-16). */
@Injectable()
export class PlansService {
  constructor(@Inject(PLANS_STORE) private readonly store: PlansStore) {}

  async create(values: NewPlanValues): Promise<PlanRecord> {
    try {
      return await this.store.run((tx) => this.store.create(tx, values));
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'rank') {
        throw new ApiError('validation_error', 'That rank is already used by a for-sale plan.', {
          field: 'rank',
        });
      }
      throw error;
    }
  }

  /** PLN-10: for-sale plans only -- the only thing a tenant-facing or public caller ever sees. */
  listForSale(): Promise<PlanRecord[]> {
    return this.store.run((tx) => this.store.listForSale(tx));
  }

  /** Includes not-for-sale plans, for the operator's own list. */
  listAll(): Promise<PlanRecord[]> {
    return this.store.run((tx) => this.store.listAll(tx));
  }

  async findById(id: string): Promise<PlanRecord> {
    const plan = await this.store.run((tx) => this.store.findById(tx, id));
    if (!plan) throw new ApiError('not_found', 'Plan not found.', {});
    return plan;
  }

  /** PLN-02/D2-3: snapshots the prior version, then applies the edit, atomically. */
  async update(id: string, edit: PlanEditValues): Promise<PlanRecord> {
    try {
      const updated = await this.store.run((tx) => this.store.update(tx, id, edit));
      if (!updated) throw new ApiError('not_found', 'Plan not found.', {});
      return updated;
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'rank') {
        throw new ApiError('validation_error', 'That rank is already used by a for-sale plan.', {
          field: 'rank',
        });
      }
      throw error;
    }
  }

  listVersions(planId: string): Promise<PlanVersionRecord[]> {
    return this.store.run((tx) => this.store.listVersions(tx, planId));
  }

  /** PLN-08: retiring hides a plan from purchase without deleting it; never fails. */
  retire(id: string): Promise<PlanRecord> {
    return this.update(id, { forSale: false });
  }

  /** PLN-08: a plan referenced by any snapshot or assignment isn't deletable, only retired. */
  async delete(id: string): Promise<void> {
    await this.store.run(async (tx) => {
      const plan = await this.store.findById(tx, id);
      if (!plan) throw new ApiError('not_found', 'Plan not found.', {});
      if (await this.store.isReferenced(tx, id)) {
        throw new ApiError(
          'conflict',
          'This plan is in use. Retire it instead of deleting it.',
          {},
        );
      }
      await this.store.delete(tx, id);
    });
  }
}
