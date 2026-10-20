import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  ServerFieldProblemCode,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { NewPlanValues, PlanEditValues, PlansStore } from '../ports/plans-store';
import { PLANS_STORE } from '../tokens';
import type { PlanRecord, PlanVersionRecord } from '../types/plan';

/** The operator making a plan change, as the platform audit log names them (ADM-08). */
export interface PlanOperator {
  operatorId: string;
  ip: string | null;
}

/**
 * control.plans and control.plan_versions (PLN-01 to PLN-12, PLN-16). ADM-08: every operator change to a plan is in
 * the platform audit log, committed with the change or not at all.
 */
@Injectable()
export class PlansService {
  constructor(
    @Inject(PLANS_STORE) private readonly store: PlansStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  async create(values: NewPlanValues, operator: PlanOperator): Promise<PlanRecord> {
    try {
      return await this.store.run(async (tx) => {
        const created = await this.store.create(tx, values);
        await this.audit(tx, operator, PlatformAuditAction.PlanCreated, created.id, {
          oldValue: null,
          newValue: values,
        });
        return created;
      });
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'rank') {
        throw new FieldsError([
          { field: 'rank', problem: ServerFieldProblemCode.Taken, messageKey: 'PlanRankTaken' },
        ]);
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
    if (!plan) throw new ApiError('not_found', 'PlanNotFound', {});
    return plan;
  }

  /** PLN-02/D2-3: snapshots the prior version, then applies the edit, atomically, with its audit entry. */
  async update(id: string, edit: PlanEditValues, operator: PlanOperator): Promise<PlanRecord> {
    try {
      return await this.store.run(async (tx) => {
        const updated = await this.store.update(tx, id, edit);
        if (!updated) throw new ApiError('not_found', 'PlanNotFound', {});
        // Only the fields the caller set: Zod fills the others in as an explicit `undefined`.
        const changed = Object.fromEntries(
          Object.entries(edit).filter(([, value]) => value !== undefined),
        );
        await this.audit(tx, operator, PlatformAuditAction.PlanUpdated, id, {
          newValue: changed,
          version: updated.version,
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'rank') {
        throw new FieldsError([
          { field: 'rank', problem: ServerFieldProblemCode.Taken, messageKey: 'PlanRankTaken' },
        ]);
      }
      throw error;
    }
  }

  listVersions(planId: string): Promise<PlanVersionRecord[]> {
    return this.store.run((tx) => this.store.listVersions(tx, planId));
  }

  /** PLN-08: retiring hides a plan from purchase without deleting it; never fails. */
  retire(id: string, operator: PlanOperator): Promise<PlanRecord> {
    return this.update(id, { forSale: false }, operator);
  }

  /** PLN-08: a plan referenced by any snapshot or assignment isn't deletable, only retired. */
  async delete(id: string, operator: PlanOperator): Promise<void> {
    await this.store.run(async (tx) => {
      const plan = await this.store.findById(tx, id);
      if (!plan) throw new ApiError('not_found', 'PlanNotFound', {});
      if (await this.store.isReferenced(tx, id)) {
        throw new ApiError('conflict', 'PlanInUse', {});
      }
      await this.store.delete(tx, id);
      await this.audit(tx, operator, PlatformAuditAction.PlanDeleted, id, {
        oldValue: { name: plan.name, rank: plan.rank },
      });
    });
  }

  private audit(
    tx: Transaction,
    operator: PlanOperator,
    action: PlatformAuditAction,
    planId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.platformAudit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operator.operatorId,
      action,
      targetType: 'plan',
      targetId: planId,
      result: AuditResult.Success,
      ip: operator.ip,
      summary,
    });
  }
}
