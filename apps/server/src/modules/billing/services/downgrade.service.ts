import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  ScheduledPlanChangeKind,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { DEFAULT_SEATS, StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { ScheduledPlanChangesStore } from '../ports/scheduled-plan-changes-store';
import { SCHEDULED_PLAN_CHANGES_STORE } from '../tokens';
import type { ScheduledPlanChangeRecord } from '../types/scheduled-plan-change';
import { PlansService } from './plans.service';

export interface OverLimitItem {
  key: string;
  used: number;
  limit: number;
}

/**
 * DWN-01 to DWN-18: scheduling a downgrade to a lower-ranked plan, effective at the current period's end,
 * with nothing changing before then (DWN-02). `apply()` is a plain injectable method, callable directly --
 * slice 7's recurring lifecycle job (D2-6) is what actually calls it once `effective_at` passes; nothing here
 * runs on a cron yet, the same deferred-trigger shape every other time-based mechanism in this plan uses.
 */
@Injectable()
export class DowngradeService {
  constructor(
    @Inject(SCHEDULED_PLAN_CHANGES_STORE) private readonly store: ScheduledPlanChangesStore,
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** DWN-01: schedules a downgrade; re-scheduling replaces any existing one (the row is upserted). */
  async schedule(tenantId: string, planId: string): Promise<ScheduledPlanChangeRecord> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!info || info.state !== TenantState.Active || !info.planId || !info.periodEnd) {
      throw new ApiError('plan_feature_unavailable', 'DowngradeNotAvailable', {});
    }
    const periodEnd = info.periodEnd;

    const currentPlan = await this.plans.findById(info.planId);
    const targetPlan = await this.plans.findById(planId);
    if (!targetPlan.forSale || targetPlan.rank >= currentPlan.rank) {
      throw new ApiError('validation_error', 'DowngradeMustBeLowerRank', {});
    }

    const change = await this.store.run((tx) =>
      this.store.upsert(tx, {
        tenantId,
        kind: ScheduledPlanChangeKind.Downgrade,
        targetPlanId: planId,
        effectiveAt: periodEnd,
      }),
    );
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId: null,
      action: AuditAction.DowngradeScheduled,
      targetType: 'plan',
      targetId: planId,
      result: AuditResult.Success,
      summary: { targetPlanId: planId, effectiveAt: change.effectiveAt },
    });
    return change;
  }

  /** DWN-03: every limit the target plan would already be over, today -- only what's actually trackable. */
  async preview(tenantId: string, planId: string): Promise<OverLimitItem[]> {
    const targetPlan = await this.plans.findById(planId);
    const seatLimit = targetPlan.limits.staff ?? DEFAULT_SEATS;
    const { seats } = await this.staff.list({ id: tenantId, planLimits: targetPlan.limits });

    const items: OverLimitItem[] = [];
    if (seats.used > seatLimit) items.push({ key: 'staff', used: seats.used, limit: seatLimit });
    return items;
  }

  /** DWN-02: the banner data -- null when nothing is scheduled. */
  getScheduled(tenantId: string): Promise<ScheduledPlanChangeRecord | null> {
    return this.store.run((tx) => this.store.findByTenant(tx, tenantId));
  }

  /** DWN-04: cancels a scheduled downgrade before it takes effect. */
  async cancel(tenantId: string): Promise<void> {
    const existing = await this.getScheduled(tenantId);
    if (!existing) throw new ApiError('not_found', 'ScheduledChangeNotFound', {});
    await this.store.run((tx) => this.store.delete(tx, tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId: null,
      action: AuditAction.DowngradeCancelled,
      targetType: 'plan',
      targetId: existing.targetPlanId,
      result: AuditResult.Success,
      summary: {},
    });
  }

  /**
   * UPG-13: an upgrade supersedes any pending downgrade/pay-as-you-go-switch. Called inside the upgrade's own
   * activation transaction -- both control-schema, no RLS concern, so this can safely join that transaction.
   */
  cancelIfScheduled(tx: Transaction, tenantId: string): Promise<void> {
    return this.store.delete(tx, tenantId);
  }

  /**
   * DWN-06/08/15/17: applies an already-effective downgrade. Two sequential steps, not one transaction: the
   * plan swap is control-schema, seat enforcement is tenant-schema (row-level security) -- the same boundary
   * every other cross-cutting action in this codebase already respects, never mixed into one transaction.
   */
  async apply(change: ScheduledPlanChangeRecord, now: Date): Promise<void> {
    if (!change.targetPlanId) throw new Error('a downgrade change is missing its target plan');
    const plan = await this.plans.findById(change.targetPlanId);

    await this.tenants.runStandalone(async (tx) => {
      const info = await this.tenants.findBillingInfo(tx, change.tenantId);
      if (!info || !info.periodStart || !info.periodEnd) {
        throw new Error('a downgrading tenant is missing its running period');
      }
      await this.tenants.applyPlanAssignment(tx, change.tenantId, {
        planId: plan.id,
        planSnapshot: plan.limits,
        periodStart: info.periodStart,
        periodEnd: info.periodEnd,
        state: TenantState.Active,
      });
      await this.store.delete(tx, change.tenantId);
      await this.audit.record(tx, {
        tenantId: change.tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.DowngradeApplied,
        targetType: 'plan',
        targetId: plan.id,
        result: AuditResult.Success,
        summary: { newPlanId: plan.id },
      });
    });

    const seatLimit = plan.limits.staff ?? DEFAULT_SEATS;
    await this.staff.enforceSeatLimit(
      { id: change.tenantId, planLimits: plan.limits },
      seatLimit,
      now,
    );
  }
}
