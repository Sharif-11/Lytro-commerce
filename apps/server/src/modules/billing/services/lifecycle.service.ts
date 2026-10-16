import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
  SLUG_MAX_LENGTH,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { daysBetween } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { DataExportService } from '../../data-export/services/data-export.service';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import { PurchaseService } from './purchase.service';

// LIF-26, 2.3: defaults, each a day-count *within* that stage, not cumulative from period end.
const DEFAULT_STAGE_DAYS = { grace: 3, readOnly: 4, locked: 8, archived: 45 };

// PYG-21: a pay-as-you-go tenant idle this many days gets the warning / is archived.
const PAYG_WARNING_DAYS = 23;
const PAYG_ARCHIVE_DAYS = 30;

// LIF-18: deletion warnings, counted the same way as every other lifecycle day (from period end).
const DELETION_WARNING_DAYS = [45, 57] as const;

export interface StageLengths {
  grace: number;
  readOnly: number;
  locked: number;
  archived: number;
}

export interface LifecycleTickResult {
  transitioned: number;
  warningsSent: number;
  deleted: number;
  renewed: number;
  slugsReleased: number;
}

/**
 * LIF-01 to LIF-26, PYG-21: the recurring lifecycle job (D2-6's own payoff) plus the owner's cancel/undo
 * intent (LIF-01). `runTick` is callable directly -- the pg-boss recurring worker is the only thing that
 * calls it on a schedule; nothing here is itself a job.
 */
@Injectable()
export class LifecycleService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(TenantCache) private readonly tenantCache: TenantCache,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(DataExportService) private readonly dataExports: DataExportService,
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(MessagingService) private readonly sms: MessagingService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * LIF-04: the state a tenant should be in right now, derived purely from how many days have passed since
   * its period ended -- never advanced one step at a time, so LIF-23's idempotency (running this twice gives
   * the same answer) and catching up after a missed run both follow for free, with nothing to "remember".
   */
  deriveState(daysLapsed: number, stages: StageLengths): TenantState {
    if (daysLapsed < stages.grace) return TenantState.Grace;
    if (daysLapsed < stages.grace + stages.readOnly) return TenantState.ReadOnly;
    if (daysLapsed < stages.grace + stages.readOnly + stages.locked) return TenantState.Locked;
    return TenantState.Archived; // day-60 (deletionDayOf) deletion is a separate step, not a fifth state
  }

  deletionDayOf(stages: StageLengths): number {
    return stages.grace + stages.readOnly + stages.locked + stages.archived;
  }

  /** LIF-26: today's stage lengths, each falling back to its documented default if never set by an operator. */
  async stageLengths(): Promise<StageLengths> {
    const read = async (key: PlatformSettingKey, fallback: number): Promise<number> => {
      const setting = await this.settings.current(key);
      return typeof setting?.value === 'number' ? setting.value : fallback;
    };
    return {
      grace: await read(PlatformSettingKey.GraceDays, DEFAULT_STAGE_DAYS.grace),
      readOnly: await read(PlatformSettingKey.ReadOnlyDays, DEFAULT_STAGE_DAYS.readOnly),
      locked: await read(PlatformSettingKey.LockedDays, DEFAULT_STAGE_DAYS.locked),
      archived: await read(PlatformSettingKey.ArchivedDays, DEFAULT_STAGE_DAYS.archived),
    };
  }

  /** LIF-03/23: the recurring job's single entry point. */
  async runTick(now: Date): Promise<LifecycleTickResult> {
    const stages = await this.stageLengths();
    const deletionDay = this.deletionDayOf(stages);
    const candidates = await this.tenants.runStandalone((tx) =>
      this.tenants.findLapsingCandidates(tx, now),
    );

    let transitioned = 0;
    let warningsSent = 0;
    let deleted = 0;
    let renewed = 0;

    for (const candidate of candidates) {
      const daysLapsed = daysBetween(candidate.periodEnd, now);

      if (daysLapsed >= deletionDay) {
        if (await this.deleteIfDue(candidate.id, now)) deleted += 1;
        continue; // a deleted tenant needs no further transition or warning this tick
      }

      // BIL-17: still `active` means this is the first tick since period end -- the one chance to renew
      // from balance before the lapse ladder (Grace/ReadOnly/Locked) starts. Already past Active (a later
      // tick, or an operator/owner action moved it) means the window closed; no retry here.
      if (candidate.state === TenantState.Active && (await this.tryAutoRenew(candidate.id))) {
        renewed += 1;
        continue;
      }

      const target = this.deriveState(daysLapsed, stages);
      if (target !== candidate.state) {
        await this.transition(candidate.id, candidate.state, target);
        transitioned += 1;
      }
      if (await this.sendDeletionWarningIfDue(candidate.id, daysLapsed)) {
        warningsSent += 1;
      }
    }

    const payg = await this.runPaygInactivityPass(now);
    const slugsReleased = await this.releaseExpiredSlugs(now);
    return {
      transitioned: transitioned + payg.transitioned,
      warningsSent: warningsSent + payg.warningsSent,
      deleted: deleted + payg.deleted,
      renewed,
      slugsReleased,
    };
  }

  /**
   * LIF-21: deleted tenants whose 30-day subdomain reservation has lapsed get revoked -- the slug mangled
   * (freeing the literal string for a different subscriber) and the rest of the shop's identity/contact
   * fields cleared (`TenantRepository.revokeExpiredTenant`), an independent pass like PYG-21's since
   * candidates are governed purely by `deletedAt`, not by anything `findLapsingCandidates` already scans.
   * The mangled slug is deterministic from the tenant's own id, truncated to fit `SLUG_MAX_LENGTH`, and
   * contains the `-revoked-` marker the repository's own candidate query excludes -- that marker is the only
   * idempotency check needed (the same "the write proves it happened" pattern `DWN-11`'s floor columns use).
   * The database trigger permitting this one slug write (migration 0037) is what actually makes it legal;
   * this method doesn't special-case it.
   */
  private async releaseExpiredSlugs(now: Date): Promise<number> {
    const candidates = await this.tenants.runStandalone((tx) =>
      this.tenants.findRevocationCandidates(tx, now),
    );
    for (const candidate of candidates) {
      const marker = `-revoked-${candidate.id.replace(/-/g, '').slice(0, 8)}`;
      const mangled = `${candidate.slug.slice(0, SLUG_MAX_LENGTH - marker.length)}${marker}`;
      await this.tenants.runStandalone((tx) =>
        this.tenants.revokeExpiredTenant(tx, candidate.id, mangled),
      );
    }
    return candidates.length;
  }

  /**
   * BIL-17: attempts a renewal from balance for a tenant whose period just ended, reusing the same
   * quote-then-confirm-from-balance path a manual renewal uses (`PurchaseService`) rather than duplicating
   * its pricing/extend logic. Returns false (never throws for an expected business reason) whenever renewal
   * isn't applicable or doesn't go through, so the caller falls through to the normal lapse ladder: the
   * toggle is off, there's no plan/term to renew into, LIF-01's cancellation intent is set (the owner's
   * explicit "don't renew" always wins over the toggle), the plan/price changed under it, or the balance is
   * insufficient (`ApiError` from `BalanceService.charge`/`PurchaseService`).
   */
  private async tryAutoRenew(tenantId: string): Promise<boolean> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!info?.autoRenewEnabled || !info.planId || !info.billingTermId || info.cancelledAt) {
      return false;
    }
    try {
      const payment = await this.purchase.quote(tenantId, info.planId, info.billingTermId);
      await this.purchase.confirmFromBalance(payment.id, tenantId);
      return true;
    } catch (error) {
      if (error instanceof ApiError) return false; // expected: price gone, insufficient balance, etc.
      throw error;
    }
  }

  /** LIF-25: one audit entry per transition; LIF-09 freezes the balance the moment a tenant is no longer Grace. */
  private async transition(tenantId: string, from: TenantState, to: TenantState): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setLifecycleState(tx, tenantId, to);
      if (to !== TenantState.Grace) await this.balance.freeze(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.LifecycleStateChanged,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { from, to },
      });
    });
    // TEN-27: invalidated within 5 seconds of a tenant being archived, not left to the cache's own 60s TTL.
    if (to === TenantState.Archived) this.tenantCache.invalidateTenant(tenantId);
  }

  /** LIF-19: the day-60 business-data deletion. Guarded by `deletedAt IS NULL` (findLapsingCandidates already
   * excludes a deleted tenant), so a second tick after this one is a no-op for this tenant, not a retry. */
  private async deleteIfDue(tenantId: string, now: Date): Promise<boolean> {
    await this.staff.deleteAllForTenant({ id: tenantId, planLimits: null });
    await this.dataExports.deleteAllForTenant(tenantId); // LIF-16/19: exports go with the rest of the data.
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.markDeleted(tx, tenantId, now);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.TenantDeleted,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {},
      });
    });
    return true;
  }

  /**
   * LIF-18/23: sends a day-45 or day-57 warning at most once each. Existence is checked against the audit
   * log itself (the `summary.day` already written) rather than a new column -- the same "derive, don't
   * duplicate" discipline `deriveState` above already follows for the state itself.
   */
  private async sendDeletionWarningIfDue(tenantId: string, daysLapsed: number): Promise<boolean> {
    const already = await this.audit.list(
      tenantId,
      { action: AuditAction.DeletionWarningSent },
      null,
      50,
    );
    const sentDays = new Set(
      already.entries
        .map((entry) => (entry.summary as { day?: number } | null)?.day)
        .filter((day): day is number => day !== undefined),
    );
    // The smallest crossed-but-unsent threshold -- so catching up after a missed run (LIF-23) still sends
    // 45 before 57 rather than getting stuck re-finding 45 forever once both are past.
    const due = DELETION_WARNING_DAYS.find((day) => daysLapsed >= day && !sentDays.has(day));
    if (due === undefined) return false;
    const daysLeft = (60 - due).toString();
    await this.sendNotice(
      tenantId,
      AuditAction.DeletionWarningSent,
      { day: due },
      `Your shop will be deleted in ${daysLeft} day(s) unless you buy a plan. Export your data from the dashboard before then.`,
      'Your shop is scheduled for deletion',
    );
    return true;
  }

  /**
   * PYG-21: a second, independent pass -- no grace/read-only stop, matching PYG-09's voluntary-closure shape.
   * Two separate candidate lists: one for tenants still `pay_as_you_go` (warn at 23 days, archive at 30), one
   * for tenants this same pass already archived (continue their own day-60-after-archival deletion clock).
   * They never overlap -- a pay-as-you-go tenant has no period end (PYG-08), so once archived it is
   * distinguishable from a subscription-lapsed `archived` tenant (which always has one) by `period_end IS NULL`.
   */
  private async runPaygInactivityPass(now: Date): Promise<LifecycleTickResult> {
    let transitioned = 0;
    let warningsSent = 0;
    let deleted = 0;

    const inactive = await this.tenants.runStandalone((tx) =>
      this.tenants.findPaygInactiveCandidates(tx),
    );
    for (const candidate of inactive) {
      const idleDays = daysBetween(candidate.lastActivityAt ?? candidate.createdAt, now);
      if (idleDays >= PAYG_ARCHIVE_DAYS) {
        await this.tenants.runStandalone(async (tx) => {
          await this.tenants.setLifecycleState(tx, candidate.id, TenantState.Archived);
          await this.balance.freeze(tx, candidate.id);
          await this.audit.record(tx, {
            tenantId: candidate.id,
            actorType: ActorType.System,
            actorId: null,
            action: AuditAction.LifecycleStateChanged,
            targetType: 'tenant',
            targetId: candidate.id,
            result: AuditResult.Success,
            summary: {
              from: TenantState.PayAsYouGo,
              to: TenantState.Archived,
              reason: 'payg_inactivity',
            },
          });
        });
        // TEN-27: this pass's own archival, same invalidation `transition()` gives the normal lapse ladder.
        this.tenantCache.invalidateTenant(candidate.id);
        transitioned += 1;
        continue;
      }
      if (idleDays >= PAYG_WARNING_DAYS) {
        const already = await this.audit.list(
          candidate.id,
          { action: AuditAction.DeletionWarningSent },
          null,
          50,
        );
        const sent = already.entries.some(
          (entry) => (entry.summary as { reason?: string } | null)?.reason === 'payg_inactivity',
        );
        if (!sent) {
          await this.sendNotice(
            candidate.id,
            AuditAction.DeletionWarningSent,
            { reason: 'payg_inactivity', day: PAYG_WARNING_DAYS },
            'Your pay-as-you-go shop will be archived in 7 days with no activity. Any order, product creation or top-up resets this.',
            'Your shop will be archived soon',
          );
          warningsSent += 1;
        }
      }
    }

    const archived = await this.tenants.runStandalone((tx) =>
      this.tenants.findPaygArchivedCandidates(tx),
    );
    for (const candidate of archived) {
      const idleDays = daysBetween(candidate.lastActivityAt ?? candidate.createdAt, now);
      if (idleDays >= PAYG_ARCHIVE_DAYS + 60 && (await this.deleteIfDue(candidate.id, now))) {
        deleted += 1;
      }
    }

    // PYG-21 has no billing period to renew; slug release is its own independent pass, computed once in
    // runTick, not per PAYG candidate.
    return { transitioned, warningsSent, deleted, renewed: 0, slugsReleased: 0 };
  }

  /** LIF-18/PYG-21: platform-sent, never charged -- SMS + email only (no push channel exists, see slice plan). */
  private async sendNotice(
    tenantId: string,
    action: AuditAction,
    summary: Record<string, unknown>,
    body: string,
    subject: string,
  ): Promise<void> {
    const contact = await this.staff.ownerContact(tenantId);
    await this.tenants.runStandalone(async (tx) => {
      if (contact?.phone) await this.sms.queueLifecycleNotice(tx, contact.phone, body);
      if (contact?.email) await this.mail.queueLifecycleNotice(tx, contact.email, subject, body);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary,
      });
    });
  }

  /** LIF-01: the owner's own non-renewal intent. The state machine never reads this (LIF-02 already reaches
   * `grace` at period end with no flag involved) -- it only drives the dashboard's own banner and audit trail. */
  async cancelSubscription(tenantId: string, ip?: string | null): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setCancellation(tx, tenantId, this.clock());
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.SubscriptionCancelled,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {},
      });
    });
  }

  async undoCancellation(tenantId: string, ip?: string | null): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setCancellation(tx, tenantId, null);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.SubscriptionCancellationUndone,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {},
      });
    });
  }

  /** LIF-01: null means no cancellation is currently scheduled -- the dashboard's own "cancelled, effective
   * <periodEnd>"-vs-"Undo" decision, read back from the same flag `cancelSubscription`/`undoCancellation`
   * write. The state machine itself never reads this (see the comment on `cancelSubscription` above). */
  async getCancellation(tenantId: string): Promise<{ cancelledAt: Date | null }> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    return { cancelledAt: info?.cancelledAt ?? null };
  }

  /** BIL-17: the owner's own "renew automatically from balance" toggle, off by default. Read by `runTick`
   * (via `tryAutoRenew`) at the owner's own next period end -- never retroactive, never itself a charge. */
  async setAutoRenew(tenantId: string, enabled: boolean, ip?: string | null): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setAutoRenew(tx, tenantId, enabled);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.AutoRenewToggled,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { enabled },
      });
    });
  }

  /** LIF-24: an operator suspension, independent of `state` -- DashboardGuard/TenantResolver already check
   * `suspendedAt` directly, so this never needs to touch `state` at all. */
  async suspend(
    tenantId: string,
    reason: string,
    operatorId: string,
    ip?: string | null,
  ): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setSuspension(tx, tenantId, reason, this.clock());
      await this.balance.freeze(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: operatorId,
        action: AuditAction.TenantSuspended,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { reason },
      });
    });
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.TenantSuspended,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      ip: ip ?? null,
      summary: { reason },
    });
    this.tenantCache.invalidateTenant(tenantId); // TEN-27: within 5s, not the cache's own 60s TTL.
  }

  /**
   * LIF-24: reverses a suspension. Unfreezes the balance only if the tenant's own lifecycle state (independent
   * of the suspension) would not already require it frozen -- a suspended tenant who is also, say, `locked`
   * for non-payment stays frozen for that reason after the suspension itself is lifted.
   */
  async restore(tenantId: string, operatorId: string, ip?: string | null): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.clearSuspension(tx, tenantId);
      const info = await this.tenants.findBillingInfo(tx, tenantId);
      const stillLapsed =
        info?.state === TenantState.ReadOnly ||
        info?.state === TenantState.Locked ||
        info?.state === TenantState.Archived;
      if (!stillLapsed) await this.balance.unfreeze(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: operatorId,
        action: AuditAction.TenantRestored,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {},
      });
    });
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.TenantRestored,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      ip: ip ?? null,
      summary: {},
    });
    this.tenantCache.invalidateTenant(tenantId); // TEN-27: within 5s, not the cache's own 60s TTL.
  }
}
