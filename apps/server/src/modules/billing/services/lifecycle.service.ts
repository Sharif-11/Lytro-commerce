import { Inject, Injectable } from '@nestjs/common';
import type { PaygCandidateRow } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
  ScheduledPlanChangeKind,
  SLUG_MAX_LENGTH,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS, daysBetween, dhakaDate, startOfDayDhaka } from '../../../common/time';
import { toPaisa } from '../../balance/services/money';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { CatalogueEraser } from '../../catalogue/services/catalogue-eraser';
import { DeliveryZoneService } from '../../delivery/services/delivery-zone.service';
import { InventoryEraser } from '../../inventory/services/inventory-eraser';
import { PurchasingEraser } from '../../purchasing/services/purchasing-eraser';
import { PublicApiEraser } from '../../public-api/services/public-api-eraser';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import { MediaEraser } from '../../media/services/media-eraser';
import { DataExportService } from '../../data-export/services/data-export.service';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import { DowngradeService } from './downgrade.service';
import { AddonRenewalService, addonsTotal, withinBudget } from './addon-renewal.service';
import { PurchaseService } from './purchase.service';

// LIF-26, 2.3: defaults, each a day-count *within* that stage, not cumulative from period end.
const DEFAULT_STAGE_DAYS = { grace: 3, readOnly: 4, locked: 8, archived: 45 };

// PYG-21: a pay-as-you-go tenant idle this many days gets the warning / is archived.
const PAYG_WARNING_DAYS = 23;
const PAYG_ARCHIVE_DAYS = 30;
// PYG-09, LIF-19: an archived pay-as-you-go tenant's business data goes this many days after its archival.
const PAYG_DELETION_DAYS_AFTER_ARCHIVAL = 60;

// LIF-18: deletion warnings, counted the same way as every other lifecycle day (from period end).
const DELETION_WARNING_DAYS = [45, 57] as const;

// BIL-14: renewal reminders, counted down to period end while still `active`. Order matters -- `.find`
// below returns the first match, so a missed tick still catches up on 7 before 3 before 1.
const RENEWAL_REMINDER_DAYS = [7, 3, 1] as const;

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
  remindersSent: number;
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
    @Inject(PurchasingEraser) private readonly purchasing: PurchasingEraser,
    @Inject(InventoryEraser) private readonly inventory: InventoryEraser,
    @Inject(CatalogueEraser) private readonly catalogue: CatalogueEraser,
    @Inject(PublicApiEraser) private readonly publicSide: PublicApiEraser,
    @Inject(UsageWarnings) private readonly usageWarnings: UsageWarnings,
    @Inject(MediaEraser) private readonly media: MediaEraser,
    @Inject(DeliveryZoneService) private readonly deliveryZones: DeliveryZoneService,
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
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
    const candidates = await this.tenants.runStandalone((tx) =>
      this.tenants.findLapsingCandidates(tx, now),
    );

    let transitioned = 0;
    let warningsSent = 0;
    let deleted = 0;
    let renewed = 0;
    let remindersSent = 0;

    for (const candidate of candidates) {
      const daysLapsed = daysBetween(candidate.periodEnd, now);

      // LIF-26: an already-lapsed tenant keeps the schedule it started with, even if the platform's live
      // settings have since changed. `lapseScheduleSnapshot` is null only before the first lapsing tick;
      // every later tick for this same lapse reads the frozen copy instead of today's `stages`.
      const tenantStages = candidate.lapseScheduleSnapshot ?? stages;
      const tenantDeletionDay = this.deletionDayOf(tenantStages);

      if (daysLapsed >= tenantDeletionDay) {
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

      const target = this.deriveState(daysLapsed, tenantStages);
      if (target !== candidate.state) {
        if (candidate.lapseScheduleSnapshot === null) {
          await this.tenants.runStandalone((tx) =>
            this.tenants.setLapseScheduleSnapshot(tx, candidate.id, tenantStages),
          );
        }
        await this.transition(candidate.id, candidate.state, target, now);
        transitioned += 1;
      }
      if (await this.sendDeletionWarningIfDue(candidate.id, daysLapsed)) {
        warningsSent += 1;
      }
      // BIL-14: the daily-during-grace half -- `target` is this tick's authoritative state, not the row's
      // possibly-stale `candidate.state`, so a tenant entering grace this very tick is already covered.
      if (
        target === TenantState.Grace &&
        (await this.sendDailyGraceReminderIfDue(candidate.id, now))
      ) {
        remindersSent += 1;
      }
    }

    const upcomingRemindersSent = await this.runRenewalReminderPass(now);
    const payg = await this.runPaygInactivityPass(now);
    const slugsReleased = await this.releaseExpiredSlugs(now);
    return {
      transitioned: transitioned + payg.transitioned,
      warningsSent: warningsSent + payg.warningsSent,
      deleted: deleted + payg.deleted,
      renewed,
      slugsReleased,
      remindersSent: remindersSent + upcomingRemindersSent + payg.remindersSent,
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
   *
   * PLN-14: the plan first, then its add-ons oldest first for as long as the balance reaches; the owner is told which
   * were left to end, and by how much the balance was short.
   */
  private async tryAutoRenew(tenantId: string): Promise<boolean> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!info?.autoRenewEnabled || !info.planId || !info.billingTermId || info.cancelledAt) {
      return false;
    }
    try {
      const offer = await this.purchase.renewalOffer(tenantId, info.planId, info.billingTermId);
      const balance = toPaisa((await this.balance.current(tenantId)).amount);
      const { kept, dropped } = withinBudget(offer.carries, balance - toPaisa(offer.price));
      const payment = await this.purchase.quote(tenantId, info.planId, info.billingTermId, kept);
      await this.purchase.confirmFromBalance(payment.id, tenantId);
      if (dropped.length > 0) {
        const short = toPaisa(offer.price) + addonsTotal(offer.carries) - balance;
        await this.renewals.tellNotRenewed(tenantId, dropped, short);
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError) return false; // expected: price gone, insufficient balance, etc.
      throw error;
    }
  }

  /** LIF-25: one audit entry per transition; LIF-09 freezes the balance the moment a tenant is no longer Grace. */
  private async transition(
    tenantId: string,
    from: TenantState,
    to: TenantState,
    now: Date,
  ): Promise<void> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setLifecycleState(tx, tenantId, to, now);
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
    // Phase 3: purchases and suppliers, the stock ledger and levels, then products and everything under them,
    // categories, attributes, option sets and the settings row, then its media (the rows now, every stored file under
    // its prefix in the deletion job, MED-09), then the delivery zones those products' limits named, the shop's API
    // keys and request counts, and the record of its usage warnings. Each step is safe to repeat if a tick stops between
    // them.
    await this.purchasing.deleteAllForTenant(tenantId);
    await this.inventory.deleteAllForTenant(tenantId);
    await this.catalogue.deleteAllForTenant(tenantId);
    await this.media.deleteAllForTenant(tenantId);
    await this.deliveryZones.deleteAllForTenant(tenantId);
    await this.publicSide.deleteAllForTenant(tenantId);
    await this.usageWarnings.deleteAllForTenant(tenantId);
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
  private async sendDeletionWarningIfDue(
    tenantId: string,
    daysLapsed: number,
    since?: Date,
  ): Promise<boolean> {
    const already = await this.audit.list(
      tenantId,
      { action: AuditAction.DeletionWarningSent },
      null,
      50,
    );
    // `since`: only this archival's own warnings count, never one from an earlier archival the tenant came back from.
    const sentDays = new Set(
      already.entries
        .filter((entry) => since === undefined || entry.createdAt >= since)
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
      `Your shop will be deleted in ${daysLeft} day(s) unless you buy a plan or choose pay-as-you-go. Export your data from the dashboard before then.`,
      'Your shop is scheduled for deletion',
    );
    return true;
  }

  /**
   * BIL-14: the pre-period-end half -- still-`active` tenants whose period ends within the next
   * `RENEWAL_REMINDER_DAYS[0]` days. The "daily during grace" half is inlined in `runTick`'s own loop,
   * since those candidates are already being iterated there.
   */
  private async runRenewalReminderPass(now: Date): Promise<number> {
    const horizonDays = Math.max(...RENEWAL_REMINDER_DAYS);
    const horizon = new Date(now.getTime() + horizonDays * DAY_MS);
    const upcoming = await this.tenants.runStandalone((tx) =>
      this.tenants.findUpcomingRenewalCandidates(tx, now, horizon),
    );
    let sent = 0;
    for (const candidate of upcoming) {
      const daysUntilPeriodEnd = daysBetween(now, candidate.periodEnd);
      if (
        await this.sendPreRenewalReminderIfDue(
          candidate.id,
          daysUntilPeriodEnd,
          candidate.periodEnd,
        )
      ) {
        sent += 1;
      }
    }
    return sent;
  }

  /**
   * BIL-14: sends the 7/3/1-day-out reminder at most once per threshold in each period, the same audit-log
   * existence check `sendDeletionWarningIfDue` uses, just counting down to period end instead of up from it.
   * KNOWN-GAPS §86: only this period's reminders count -- each names the period end it was for, and one written
   * before they did counts only when recent enough to have been for this period.
   */
  private async sendPreRenewalReminderIfDue(
    tenantId: string,
    daysUntilPeriodEnd: number,
    periodEnd: Date,
  ): Promise<boolean> {
    // PYG-10: a shop switching to pay-as-you-go at this period's end has nothing to renew.
    const scheduled = await this.downgrade.getScheduled(tenantId);
    if (scheduled?.kind === ScheduledPlanChangeKind.PayAsYouGoSwitch) return false;
    const already = await this.audit.list(
      tenantId,
      { action: AuditAction.RenewalReminderSent },
      null,
      50,
    );
    const period = periodEnd.toISOString();
    const earliest = periodEnd.getTime() - (Math.max(...RENEWAL_REMINDER_DAYS) + 1) * DAY_MS;
    const sentDays = new Set(
      already.entries.flatMap((entry) => {
        const summary = entry.summary as { day?: number; periodEnd?: string } | null;
        if (summary?.day === undefined) return [];
        const forThisPeriod =
          summary.periodEnd === undefined
            ? entry.createdAt.getTime() >= earliest
            : summary.periodEnd === period;
        return forThisPeriod ? [summary.day] : [];
      }),
    );
    const due = RENEWAL_REMINDER_DAYS.find(
      (day) => daysUntilPeriodEnd <= day && !sentDays.has(day),
    );
    if (due === undefined) return false;
    await this.sendRenewalReminderNotice(tenantId, { day: due, periodEnd: period }, due);
    return true;
  }

  /**
   * BIL-14: the daily-during-grace half. "Daily" is a calendar day (Asia/Dhaka, TRM-09's own convention),
   * not a rolling 24h window -- checked against the single most recent `RenewalReminderSent` entry rather
   * than building a `Set`, since only "was one sent today" matters here, not a fixed set of thresholds.
   */
  private async sendDailyGraceReminderIfDue(tenantId: string, now: Date): Promise<boolean> {
    const latest = await this.audit.list(
      tenantId,
      { action: AuditAction.RenewalReminderSent },
      null,
      1,
    );
    const lastSentAt = latest.entries[0]?.createdAt;
    if (lastSentAt && startOfDayDhaka(lastSentAt).getTime() === startOfDayDhaka(now).getTime()) {
      return false;
    }
    await this.sendRenewalReminderNotice(tenantId, {}, null);
    return true;
  }

  /**
   * BIL-14: email (and the in-app banner, computed client-side from `/me`'s own `periodEnd` -- no backend
   * state) only, never SMS -- the requirement's own explicit carve-out, unlike `sendNotice` below which
   * every other lifecycle notice uses and which does send SMS. Push has no provider in this codebase at
   * all yet (the same already-acknowledged gap PYG-21's own day-23 warning has); deferred, not silently
   * dropped.
   */
  private async sendRenewalReminderNotice(
    tenantId: string,
    summary: Record<string, unknown>,
    daysLeft: number | null,
  ): Promise<void> {
    const contact = await this.staff.ownerContact(tenantId);
    const body =
      daysLeft === null
        ? 'Your shop is in its grace period. Renew now to avoid losing access to your dashboard.'
        : `Your plan renews in ${daysLeft.toString()} day(s). Renew now to avoid any interruption.`;
    await this.tenants.runStandalone(async (tx) => {
      if (contact?.email) {
        await this.mail.queueLifecycleNotice(tx, contact.email, 'Your plan is renewing soon', body);
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.RenewalReminderSent,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary,
      });
    });
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
      const since = this.idleSince(candidate);
      const idleDays = daysBetween(since, now);
      if (idleDays >= PAYG_ARCHIVE_DAYS) {
        await this.tenants.runStandalone(async (tx) => {
          await this.tenants.setLifecycleState(tx, candidate.id, TenantState.Archived, now);
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
        // PYG-21: "exactly once per idle period" -- a qualifying activity resets the clock without the
        // tenant ever leaving `pay_as_you_go` (unlike the lapse ladder, where renewing exits the candidate
        // list entirely), so a warning from a *previous* idle period must not suppress this one. Scoped to
        // entries no older than the current idle streak's own start.
        const already = await this.audit.list(
          candidate.id,
          { action: AuditAction.DeletionWarningSent },
          null,
          50,
        );
        const sent = already.entries.some(
          (entry) =>
            (entry.summary as { reason?: string } | null)?.reason === 'payg_inactivity' &&
            entry.createdAt >= since,
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
      // LIF-18/19 count from the archival itself -- idle day 30 (PYG-21), the owner's closure or a suspension
      // (PYG-09): warnings at 45 and 57, deletion at 60. A shop archived before `archived_at` was kept was
      // archived for inactivity, so its idle clock gives the same date.
      const archivedAt =
        candidate.archivedAt ??
        new Date(this.idleSince(candidate).getTime() + PAYG_ARCHIVE_DAYS * DAY_MS);
      const daysArchived = daysBetween(archivedAt, now);
      if (
        daysArchived >= PAYG_DELETION_DAYS_AFTER_ARCHIVAL &&
        (await this.deleteIfDue(candidate.id, now))
      ) {
        deleted += 1;
        continue;
      }
      if (await this.sendDeletionWarningIfDue(candidate.id, daysArchived, archivedAt)) {
        warningsSent += 1;
      }
    }

    // PYG-21 has no billing period to renew; slug release is its own independent pass, computed once in
    // runTick, not per PAYG candidate. BIL-14's renewal reminders don't apply either -- no period end here.
    return { transitioned, warningsSent, deleted, renewed: 0, slugsReleased: 0, remindersSent: 0 };
  }

  /**
   * PYG-21: the idle clock runs from the latest qualifying activity or from when the tenant became
   * pay-as-you-go (`periodStart`, set by the trial conversion, TRL-07), whichever is later -- never from the
   * shop's creation, so a trial that ends with no activity gets its full 30 days as pay-as-you-go. A row with no
   * `periodStart` falls back to the activity, then the creation date.
   */
  private idleSince(candidate: PaygCandidateRow): Date {
    const becamePayg = candidate.periodStart;
    if (becamePayg === null) return candidate.lastActivityAt ?? candidate.createdAt;
    const activity = candidate.lastActivityAt;
    return activity !== null && activity.getTime() > becamePayg.getTime() ? activity : becamePayg;
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

  /**
   * PYG-09: the owner closes a pay-as-you-go shop. It is archived at once -- no grace or read-only stage, since
   * no paid period exists to protect -- and its business data is deleted 60 days later, after the day-45 and
   * day-57 warnings (LIF-18, LIF-19). Until then, choosing pay-as-you-go or buying a plan reopens it (LIF-15).
   */
  async closePayAsYouGo(tenantId: string, ip?: string | null): Promise<void> {
    const now = this.clock();
    const contact = await this.staff.ownerContact(tenantId);
    await this.tenants.runStandalone(async (tx) => {
      const info = await this.tenants.findBillingInfo(tx, tenantId);
      if (info?.state !== TenantState.PayAsYouGo) {
        throw new ApiError('conflict', 'CloseNotAvailable', {});
      }
      await this.tenants.setLifecycleState(tx, tenantId, TenantState.Archived, now);
      await this.balance.freeze(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.ShopClosed,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { from: TenantState.PayAsYouGo, to: TenantState.Archived },
      });
      // Platform-sent and never charged, like every notice about the owner's own account (LIF-10).
      const deletionDate = dhakaDate(
        new Date(now.getTime() + PAYG_DELETION_DAYS_AFTER_ARCHIVAL * DAY_MS),
      );
      const body =
        `${info.shopName} is closed. Its data will be deleted on ${deletionDate}. Until then you can ` +
        'reopen it by choosing pay-as-you-go or a plan, and export your data from the dashboard.';
      if (contact?.phone) await this.sms.queueLifecycleNotice(tx, contact.phone, body);
      if (contact?.email) {
        await this.mail.queueLifecycleNotice(tx, contact.email, 'Your shop is closed', body);
      }
    });
    this.tenantCache.invalidateTenant(tenantId); // TEN-27: the public side goes offline at once.
  }

  /**
   * LIF-24: an operator suspension, independent of `state` -- DashboardGuard/TenantResolver already check
   * `suspendedAt` directly. PYG-09: a pay-as-you-go shop is also archived by it, at the same moment, so its
   * 60-day deletion clock starts; `restore` undoes that.
   */
  async suspend(
    tenantId: string,
    reason: string,
    operatorId: string,
    ip?: string | null,
  ): Promise<void> {
    const now = this.clock();
    await this.tenants.runStandalone(async (tx) => {
      const info = await this.tenants.findBillingInfo(tx, tenantId);
      await this.tenants.setSuspension(tx, tenantId, reason, now);
      await this.balance.freeze(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null, // AUD-08: never the operator's own id; the platform audit log keeps who it was.
        action: AuditAction.TenantSuspended,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { reason },
      });
      if (info?.state === TenantState.PayAsYouGo) {
        await this.tenants.setLifecycleState(tx, tenantId, TenantState.Archived, now);
        await this.audit.record(tx, {
          tenantId,
          actorType: ActorType.PlatformSupport,
          actorId: null,
          action: AuditAction.LifecycleStateChanged,
          ip: ip ?? null,
          targetType: 'tenant',
          targetId: tenantId,
          result: AuditResult.Success,
          summary: { from: TenantState.PayAsYouGo, to: TenantState.Archived, reason: 'suspended' },
        });
      }
      // ADM-08: the platform's own record joins the same transaction.
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.TenantSuspended,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: { reason },
      });
    });
    this.tenantCache.invalidateTenant(tenantId); // TEN-27: within 5s, not the cache's own 60s TTL.
  }

  /**
   * LIF-24: reverses a suspension. Unfreezes the balance only if the tenant's own lifecycle state (independent
   * of the suspension) would not already require it frozen -- a suspended tenant who is also, say, `locked`
   * for non-payment stays frozen for that reason after the suspension itself is lifted. PYG-09: a
   * pay-as-you-go shop the suspension archived (archived at the suspension's own moment) goes back to
   * pay-as-you-go; one already archived before it, for inactivity or by its owner, stays archived.
   */
  async restore(tenantId: string, operatorId: string, ip?: string | null): Promise<void> {
    const now = this.clock();
    await this.tenants.runStandalone(async (tx) => {
      const before = await this.tenants.findBillingInfo(tx, tenantId);
      const archivedBySuspension =
        before?.state === TenantState.Archived &&
        before.periodEnd === null &&
        before.archivedAt !== null &&
        before.archivedAt.getTime() === before.suspendedAt?.getTime();
      await this.tenants.clearSuspension(tx, tenantId);
      if (archivedBySuspension) {
        await this.tenants.returnToPayAsYouGo(tx, tenantId, now);
        await this.audit.record(tx, {
          tenantId,
          actorType: ActorType.PlatformSupport,
          actorId: null,
          action: AuditAction.LifecycleStateChanged,
          ip: ip ?? null,
          targetType: 'tenant',
          targetId: tenantId,
          result: AuditResult.Success,
          summary: { from: TenantState.Archived, to: TenantState.PayAsYouGo, reason: 'restored' },
        });
      }
      const info = await this.tenants.findBillingInfo(tx, tenantId);
      const stillLapsed =
        info?.state === TenantState.ReadOnly ||
        info?.state === TenantState.Locked ||
        info?.state === TenantState.Archived;
      if (!stillLapsed) await this.balance.unfreeze(tx, tenantId);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null, // AUD-08: never the operator's own id; the platform audit log keeps who it was.
        action: AuditAction.TenantRestored,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {},
      });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.TenantRestored,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: {},
      });
    });
    this.tenantCache.invalidateTenant(tenantId); // TEN-27: within 5s, not the cache's own 60s TTL.
  }
}
