import { Inject, Injectable } from '@nestjs/common';
import type { BillingInfoRow, Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  MONEY_RELATED_AUDIT_ACTIONS,
  type PlanLimits,
  ScheduledPlanChangeKind,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import type { AuditEntry } from '../../audit/types/activity';
import { BalanceService } from '../../balance/services/balance.service';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { DEFAULT_SEATS, StaffService } from '../../staff/services/staff.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { ScheduledPlanChangesStore } from '../ports/scheduled-plan-changes-store';
import { CLOCK, SCHEDULED_PLAN_CHANGES_STORE } from '../tokens';
import type { ScheduledPlanChangeRecord } from '../types/scheduled-plan-change';
import { PlansService } from './plans.service';

export interface OverLimitItem {
  key: string;
  used: number;
  limit: number;
}

/** PYG-01, PYG-10, LIF-15: what choosing pay-as-you-go did -- scheduled for the paid period's end, or done now. */
export interface PayAsYouGoChoice {
  effective: 'period_end' | 'now';
  /** The paid period's end for a scheduled switch; null when it took effect at once. */
  effectiveAt: Date | null;
}

// LIF-26 2.3, AUD-06: the purge job's own fallback when a plan sets no `activity_retention_days`.
const DEFAULT_ACTIVITY_RETENTION_DAYS = 30;

// DWN-11: the shorter retention a downgrade brings never applies sooner than this many days after notice.
const RETENTION_NOTICE_DAYS = 14;

// LIF-15: the lapsed stages a shop can still be restored from by choosing pay-as-you-go, before deletion.
const LAPSED_STATES: ReadonlySet<TenantState> = new Set([
  TenantState.Grace,
  TenantState.ReadOnly,
  TenantState.Locked,
  TenantState.Archived,
]);

/** The plan a swap puts the tenant on, and the period and state it lands in. */
interface PlanSwap {
  planId: string;
  limits: PlanLimits;
  version: number;
  features: Record<string, boolean>;
  periodStart: Date;
  periodEnd: Date | null;
  state: TenantState;
}

interface RetentionShrink {
  oldDays: number;
  newDays: number;
  floorUntil: Date;
}

/**
 * DWN-01 to DWN-18, PYG-10: a scheduled plan change -- a downgrade to a lower-ranked plan, or a switch to
 * pay-as-you-go -- effective at the current period's end, with nothing changing before then (DWN-02).
 * `applyDueChanges` is called from `LifecycleTickWorker` before the lifecycle job's own `runTick`, the same
 * recurring 5-minute cadence (D2-6), so a change due at a period's end lands before any lapse or renewal.
 */
@Injectable()
export class DowngradeService {
  constructor(
    @Inject(SCHEDULED_PLAN_CHANGES_STORE) private readonly store: ScheduledPlanChangesStore,
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(TenantCache) private readonly tenantCache: TenantCache,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MessagingService) private readonly sms: MessagingService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(CLOCK) private readonly clock: () => Date,
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

  /**
   * PYG-01, PYG-10, LIF-15: the owner chooses pay-as-you-go. While a paid period is still running, the switch is
   * scheduled for that period's end, the same rule as a downgrade (DWN-01, DWN-02), and replaces any scheduled
   * downgrade. Once the period has ended -- grace, read-only, locked, archived -- or on a no-expiry plan (PLN-18),
   * it takes effect at once and restores the shop. A trial, a shop already on pay-as-you-go and a deleted shop
   * are refused.
   */
  async choosePayAsYouGo(tenantId: string, ip?: string | null): Promise<PayAsYouGoChoice> {
    const now = this.clock();
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!info) throw new ApiError('not_found', 'PageNotFound', {});

    const periodEnd = info.periodEnd;
    if (info.state === TenantState.Active && periodEnd !== null && periodEnd > now) {
      const change = await this.store.run((tx) =>
        this.store.upsert(tx, {
          tenantId,
          kind: ScheduledPlanChangeKind.PayAsYouGoSwitch,
          targetPlanId: null,
          effectiveAt: periodEnd,
        }),
      );
      await this.audit.recordStandalone({
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.PayAsYouGoScheduled,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { effectiveAt: change.effectiveAt },
      });
      return { effective: 'period_end', effectiveAt: change.effectiveAt };
    }

    if (info.state !== TenantState.Active && !LAPSED_STATES.has(info.state)) {
      throw new ApiError('conflict', 'PayAsYouGoNotAvailable', {});
    }
    await this.switchToPayAsYouGo(tenantId, now, ActorType.User, ip ?? null);
    return { effective: 'now', effectiveAt: null };
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

  /** DWN-04: cancels a scheduled downgrade or pay-as-you-go switch before it takes effect. */
  async cancel(tenantId: string, ip?: string | null): Promise<void> {
    const existing = await this.getScheduled(tenantId);
    if (!existing) throw new ApiError('not_found', 'ScheduledChangeNotFound', {});
    await this.store.run((tx) => this.store.delete(tx, tenantId));
    await this.audit.recordStandalone(this.cancelledEntry(existing, ip ?? null));
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
    await this.audit.record(tx, this.cancelledEntry(existing, null));
  }

  /**
   * DWN-06/08/15/17: applies an already-effective downgrade. The plan lands on the period that just ended, so
   * the renewal that follows is at the lower plan's price (DWN-05).
   */
  async apply(change: ScheduledPlanChangeRecord, now: Date): Promise<void> {
    if (!change.targetPlanId) throw new Error('a downgrade change is missing its target plan');
    const plan = await this.plans.findById(change.targetPlanId);

    const retentionShrink = await this.tenants.runStandalone(async (tx) => {
      const info = await this.tenants.findBillingInfo(tx, change.tenantId);
      if (!info || !info.periodStart || !info.periodEnd) {
        throw new Error('a downgrading tenant is missing its running period');
      }
      const shrink = await this.swapPlan(tx, change.tenantId, info, now, {
        planId: plan.id,
        limits: plan.limits,
        version: plan.version,
        features: plan.features,
        periodStart: info.periodStart,
        periodEnd: info.periodEnd,
        state: TenantState.Active,
      });
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
      return shrink;
    });

    await this.afterSwap(change.tenantId, now, plan.limits, retentionShrink);
  }

  /**
   * PYG-10, LIF-15: moves the tenant onto pay-as-you-go now -- no billing period (PYG-08), its balance usable
   * again, any cancellation intent dropped (there is nothing left to cancel), and its public side back
   * online at once (TEN-27). Seats and retention follow the same rules as a downgrade (DWN-08, DWN-11).
   */
  private async switchToPayAsYouGo(
    tenantId: string,
    now: Date,
    actorType: ActorType,
    ip: string | null,
  ): Promise<void> {
    const payg = await this.tenants.runStandalone((tx) => this.tenants.findPayAsYouGoPlan(tx));
    if (!payg) throw new Error('the Pay-as-you-go plan is not seeded');

    const retentionShrink = await this.tenants.runStandalone(async (tx) => {
      const info = await this.tenants.findBillingInfo(tx, tenantId);
      if (!info) throw new Error('a tenant switching to pay-as-you-go no longer exists');
      const shrink = await this.swapPlan(tx, tenantId, info, now, {
        planId: payg.id,
        limits: payg.limits,
        version: payg.version,
        features: payg.features,
        periodStart: now,
        periodEnd: null,
        state: TenantState.PayAsYouGo,
      });
      await this.balance.unfreeze(tx, tenantId);
      if (info.cancelledAt) await this.tenants.setCancellation(tx, tenantId, null);
      await this.audit.record(tx, {
        tenantId,
        actorType,
        actorId: null,
        action: AuditAction.PayAsYouGoApplied,
        ip,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { from: info.state },
      });
      return shrink;
    });

    await this.afterSwap(tenantId, now, payg.limits, retentionShrink);
    this.tenantCache.invalidateTenant(tenantId);
  }

  /**
   * The plan swap a downgrade and a pay-as-you-go switch share, inside the caller's transaction: the new plan
   * snapshot, the scheduled change cleared, and DWN-11's retention floor when the new plan keeps the activity
   * log for less time than the tenant is still owed.
   */
  private async swapPlan(
    tx: Transaction,
    tenantId: string,
    info: BillingInfoRow,
    now: Date,
    swap: PlanSwap,
  ): Promise<RetentionShrink | null> {
    // DWN-11: the best (longest) retention still owed -- either what the current plan already grants, or
    // a still-active floor from an earlier downgrade, whichever is longer. Never the floor if it already
    // expired; an expired floor offers no protection.
    const floorActive = info.retentionFloorUntil !== null && info.retentionFloorUntil > now;
    const oldDays = Math.max(
      info.planSnapshot?.activity_retention_days ?? DEFAULT_ACTIVITY_RETENTION_DAYS,
      floorActive ? (info.retentionFloorDays ?? 0) : 0,
    );
    const newDays = swap.limits.activity_retention_days ?? DEFAULT_ACTIVITY_RETENTION_DAYS;

    await this.tenants.applyPlanAssignment(tx, tenantId, {
      planId: swap.planId,
      planSnapshot: swap.limits,
      planVersionSnapshot: swap.version,
      featureSnapshot: swap.features,
      periodStart: swap.periodStart,
      periodEnd: swap.periodEnd,
      state: swap.state,
    });
    await this.store.delete(tx, tenantId);

    if (newDays >= oldDays) return null;
    const floorUntil = new Date(now.getTime() + RETENTION_NOTICE_DAYS * DAY_MS);
    await this.tenants.setRetentionFloor(tx, tenantId, { days: oldDays, until: floorUntil });
    return { oldDays, newDays, floorUntil };
  }

  /**
   * After a swap commits: DWN-11's notice when retention shrank, and DWN-08's seat limit. Separate from the
   * swap's own transaction -- seat enforcement is tenant-schema (row-level security), the swap control-schema,
   * the same boundary every other cross-cutting action in this codebase respects.
   */
  private async afterSwap(
    tenantId: string,
    now: Date,
    limits: PlanLimits,
    retentionShrink: RetentionShrink | null,
  ): Promise<void> {
    if (retentionShrink) {
      await this.sendRetentionShrinkNotice(tenantId, now, retentionShrink);
    }
    // PLN-19: null means unlimited seats on the plan being applied, nothing to enforce.
    const seatLimit = limits.staff === null ? null : (limits.staff ?? DEFAULT_SEATS);
    await this.staff.enforceSeatLimit({ id: tenantId, planLimits: limits }, seatLimit, now);
  }

  /** DWN-04, UPG-13: the activity entry for a scheduled change that will now never happen. */
  private cancelledEntry(existing: ScheduledPlanChangeRecord, ip: string | null): AuditEntry {
    const payAsYouGo = existing.kind === ScheduledPlanChangeKind.PayAsYouGoSwitch;
    return {
      tenantId: existing.tenantId,
      actorType: ActorType.User,
      actorId: null,
      action: payAsYouGo ? AuditAction.PayAsYouGoCancelled : AuditAction.DowngradeCancelled,
      ip,
      targetType: payAsYouGo ? 'tenant' : 'plan',
      targetId: payAsYouGo ? existing.tenantId : existing.targetPlanId,
      result: AuditResult.Success,
      summary: {},
    };
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
    shrink: RetentionShrink,
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
   * DWN-06/08/15/17, PYG-10: the recurring tick's own entry point -- every scheduled change whose `effective_at`
   * has passed, applied one at a time so one tenant's failure doesn't block the rest.
   */
  async applyDueChanges(now: Date): Promise<number> {
    const due = await this.store.run((tx) => this.store.findDue(tx, now));
    for (const change of due) {
      if (change.kind === ScheduledPlanChangeKind.PayAsYouGoSwitch) {
        await this.switchToPayAsYouGo(change.tenantId, now, ActorType.System, null);
      } else {
        await this.apply(change, now);
      }
    }
    return due.length;
  }
}
