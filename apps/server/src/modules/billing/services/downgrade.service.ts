import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  MONEY_RELATED_AUDIT_ACTIONS,
  ScheduledPlanChangeKind,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
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

// LIF-26 2.3, AUD-06: the purge job's own fallback when a plan sets no `activity_retention_days`.
const DEFAULT_ACTIVITY_RETENTION_DAYS = 30;

// DWN-11: the shorter retention a downgrade brings never applies sooner than this many days after notice.
const RETENTION_NOTICE_DAYS = 14;

/**
 * DWN-01 to DWN-18: scheduling a downgrade to a lower-ranked plan, effective at the current period's end,
 * with nothing changing before then (DWN-02). `applyDueChanges` is called from `LifecycleTickWorker`
 * alongside the lifecycle job's own `runTick`, the same recurring 5-minute cadence (D2-6).
 */
@Injectable()
export class DowngradeService {
  constructor(
    @Inject(SCHEDULED_PLAN_CHANGES_STORE) private readonly store: ScheduledPlanChangesStore,
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MessagingService) private readonly sms: MessagingService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /** DWN-01: schedules a downgrade; re-scheduling replaces any existing one (the row is upserted). */
  async schedule(
    tenantId: string,
    planId: string,
    ip?: string | null,
  ): Promise<ScheduledPlanChangeRecord> {
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
      ip: ip ?? null,
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
    const staffLimit = targetPlan.limits.staff;
    // PLN-19: null means unlimited seats on the target plan, never over-limit.
    const seatLimit = staffLimit === null ? null : (staffLimit ?? DEFAULT_SEATS);
    const { seats } = await this.staff.list({ id: tenantId, planLimits: targetPlan.limits });

    const items: OverLimitItem[] = [];
    if (seatLimit !== null && seats.used > seatLimit) {
      items.push({ key: 'staff', used: seats.used, limit: seatLimit });
    }
    return items;
  }

  /** DWN-02: the banner data -- null when nothing is scheduled. */
  getScheduled(tenantId: string): Promise<ScheduledPlanChangeRecord | null> {
    return this.store.run((tx) => this.store.findByTenant(tx, tenantId));
  }

  /** DWN-04: cancels a scheduled downgrade before it takes effect. */
  async cancel(tenantId: string, ip?: string | null): Promise<void> {
    const existing = await this.getScheduled(tenantId);
    if (!existing) throw new ApiError('not_found', 'ScheduledChangeNotFound', {});
    await this.store.run((tx) => this.store.delete(tx, tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId: null,
      action: AuditAction.DowngradeCancelled,
      ip: ip ?? null,
      targetType: 'plan',
      targetId: existing.targetPlanId,
      result: AuditResult.Success,
      summary: {},
    });
  }

  /**
   * UPG-13: an upgrade (or an ordinary purchase/renewal landing on the scheduled target, DWN-05) supersedes
   * any pending downgrade/pay-as-you-go-switch. Called inside the caller's own activation transaction --
   * both control-schema, no RLS concern, so this can safely join that transaction. Audited the same way the
   * owner's own manual `cancel()` is, since from the log's perspective it's the same event: the scheduled
   * change is gone and never takes effect.
   */
  async cancelIfScheduled(tx: Transaction, tenantId: string): Promise<void> {
    const existing = await this.store.findByTenant(tx, tenantId);
    if (!existing) return;
    await this.store.delete(tx, tenantId);
    await this.audit.record(tx, {
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
   * DWN-06/08/15/17: applies an already-effective downgrade. Two sequential steps, not one transaction: the
   * plan swap is control-schema, seat enforcement is tenant-schema (row-level security) -- the same boundary
   * every other cross-cutting action in this codebase already respects, never mixed into one transaction.
   */
  async apply(change: ScheduledPlanChangeRecord, now: Date): Promise<void> {
    if (!change.targetPlanId) throw new Error('a downgrade change is missing its target plan');
    const plan = await this.plans.findById(change.targetPlanId);

    const retentionShrink = await this.tenants.runStandalone(async (tx) => {
      const info = await this.tenants.findBillingInfo(tx, change.tenantId);
      if (!info || !info.periodStart || !info.periodEnd) {
        throw new Error('a downgrading tenant is missing its running period');
      }

      // DWN-11: the best (longest) retention still owed -- either what the current plan already grants, or
      // a still-active floor from an earlier downgrade, whichever is longer. Never the floor if it already
      // expired; an expired floor offers no protection.
      const floorActive = info.retentionFloorUntil !== null && info.retentionFloorUntil > now;
      const oldDays = Math.max(
        info.planSnapshot?.activity_retention_days ?? DEFAULT_ACTIVITY_RETENTION_DAYS,
        floorActive ? (info.retentionFloorDays ?? 0) : 0,
      );
      const newDays = plan.limits.activity_retention_days ?? DEFAULT_ACTIVITY_RETENTION_DAYS;

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

      if (newDays < oldDays) {
        const floorUntil = new Date(now.getTime() + RETENTION_NOTICE_DAYS * DAY_MS);
        await this.tenants.setRetentionFloor(tx, change.tenantId, {
          days: oldDays,
          until: floorUntil,
        });
        return { oldDays, newDays, floorUntil };
      }
      return null;
    });

    if (retentionShrink) {
      await this.sendRetentionShrinkNotice(change.tenantId, now, retentionShrink);
    }

    const planStaffLimit = plan.limits.staff;
    // PLN-19: null means unlimited seats on the plan being applied, nothing to enforce.
    const seatLimit = planStaffLimit === null ? null : (planStaffLimit ?? DEFAULT_SEATS);
    await this.staff.enforceSeatLimit(
      { id: change.tenantId, planLimits: plan.limits },
      seatLimit,
      now,
    );
  }

  /**
   * DWN-11: sent once, at the moment a downgrade shortens retention -- 14 days before the shorter retention
   * actually takes effect (`retentionFloorUntil`, just written by the caller). Counts the non-money entries
   * that sit strictly between the old and new retention windows -- exactly the ones that survive today but
   * would not once the floor lifts -- so the notice names a real number, not just the two day-counts.
   */
  private async sendRetentionShrinkNotice(
    tenantId: string,
    now: Date,
    shrink: { oldDays: number; newDays: number; floorUntil: Date },
  ): Promise<void> {
    const trimmedCount = await this.audit.countInRange(tenantId, {
      after: new Date(now.getTime() - shrink.oldDays * DAY_MS),
      before: new Date(now.getTime() - shrink.newDays * DAY_MS),
      excludeActions: [...MONEY_RELATED_AUDIT_ACTIONS],
    });
    const effectiveDate = shrink.floorUntil.toDateString();
    const body =
      `Your shop's activity log retention is shortening from ${String(shrink.oldDays)} to ` +
      `${String(shrink.newDays)} days. ${String(trimmedCount)} older entr${trimmedCount === 1 ? 'y' : 'ies'} ` +
      `will be permanently removed starting ${effectiveDate}.`;

    const contact = await this.staff.ownerContact(tenantId);
    await this.tenants.runStandalone(async (tx) => {
      if (contact?.phone) await this.sms.queueLifecycleNotice(tx, contact.phone, body);
      if (contact?.email) {
        await this.mail.queueLifecycleNotice(
          tx,
          contact.email,
          'Your data retention is changing',
          body,
        );
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.RetentionShortenedNoticeSent,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {
          oldDays: shrink.oldDays,
          newDays: shrink.newDays,
          floorUntil: shrink.floorUntil,
          trimmedCount,
        },
      });
    });
  }

  /**
   * DWN-06/08/15/17: the recurring tick's own entry point -- every scheduled change whose `effective_at` has
   * passed, applied one at a time so one tenant's failure doesn't block the rest. `PayAsYouGoSwitch` rows are
   * skipped: `kind` already anticipates that reuse (PYG-10), but nothing schedules that kind yet, and `apply`
   * itself only knows how to activate a plan, not switch to pay-as-you-go -- skipping rather than mishandling
   * a kind that can't occur today.
   */
  async applyDueChanges(now: Date): Promise<number> {
    const due = await this.store.run((tx) => this.store.findDue(tx, now));
    let applied = 0;
    for (const change of due) {
      if (change.kind !== ScheduledPlanChangeKind.Downgrade) continue;
      await this.apply(change, now);
      applied += 1;
    }
    return applied;
  }
}
