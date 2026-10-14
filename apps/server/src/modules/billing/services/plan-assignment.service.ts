import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { PlanAssignmentsStore } from '../ports/plan-assignments-store';
import type { PlansStore } from '../ports/plans-store';
import { PLAN_ASSIGNMENTS_STORE, PLANS_STORE } from '../tokens';
import type { PlanAssignmentRecord } from '../types/plan-assignment';

export interface AssignPlanInput {
  tenantId: string;
  planId: string;
  expiry: Date | null;
  reason: string;
  operatorId: string;
}

/**
 * PLN-17/18: assigns a not-for-sale plan directly to a tenant, no payment step, taking effect immediately
 * with a normal snapshot -- exactly as a purchase would. Operator-caused but changes the tenant's own plan,
 * so it writes both the tenant's activity log and the platform audit log (D2-5, PLN-17's own wording).
 */
@Injectable()
export class PlanAssignmentService {
  constructor(
    @Inject(PLAN_ASSIGNMENTS_STORE) private readonly assignments: PlanAssignmentsStore,
    @Inject(PLANS_STORE) private readonly plans: PlansStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  async assign(input: AssignPlanInput): Promise<PlanAssignmentRecord> {
    if (input.reason.trim().length === 0) {
      throw new ApiError('validation_error', 'ReasonRequired', { field: 'reason' });
    }

    const plan = await this.plans.run((tx: Transaction) => this.plans.findById(tx, input.planId));
    if (!plan) throw new ApiError('not_found', 'PlanNotFound', {});

    const assignment = await this.assignments.run((tx) => {
      return this.assignments.insert(tx, {
        tenantId: input.tenantId,
        planId: input.planId,
        expiry: input.expiry,
        reason: input.reason,
        assignedBy: input.operatorId,
      });
    });

    const now = new Date();
    await this.tenants.runStandalone((tx) =>
      this.tenants.applyPlanAssignment(tx, input.tenantId, {
        planId: input.planId,
        planSnapshot: plan.limits,
        periodStart: now,
        periodEnd: input.expiry,
      }),
    );

    await this.audit.recordStandalone({
      tenantId: input.tenantId,
      actorType: ActorType.PlatformSupport,
      actorId: null,
      action: AuditAction.PlanAssigned,
      targetType: 'plan',
      targetId: input.planId,
      result: AuditResult.Success,
      summary: { reason: input.reason, expiry: input.expiry },
    });
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: input.operatorId,
      action: PlatformAuditAction.PlanAssigned,
      targetType: 'tenant',
      targetId: input.tenantId,
      result: AuditResult.Success,
      ip: null,
      summary: { planId: input.planId, reason: input.reason, expiry: input.expiry },
    });

    return assignment;
  }
}
