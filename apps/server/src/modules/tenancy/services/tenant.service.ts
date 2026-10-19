import { Inject, Injectable } from '@nestjs/common';
import type {
  BalanceRow,
  BillingInfoRow,
  ContactDetailsRow,
  RevocationCandidateRow,
  Transaction,
} from '@lytronix/db';
import { PlatformSettingKey, type PlanLimits, type TenantState } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import { StaffService } from '../../staff/services/staff.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { type QueuedMessage } from '../../shared/messaging/types/messages';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { CLOCK, TENANT_STORE } from '../tokens';
import type { TenantStore } from '../ports/tenant-store';
import type { TrialShopRequest } from '../types/trial-shop-request';

// D3, TRL-01, TRL-05: a shop starts on the Trial plan. Fallback only -- the real value is the
// `trial_days` platform setting (LIF-26), configurable by an operator; this is used only if that row is
// somehow missing (seeded by migration, so it never should be in practice).
export const DEFAULT_TRIAL_DAYS = 30;

/**
 * Creates a shop in the trial state with its owner and the "shop ready" message (AUTH-10). It runs inside the
 * caller's transaction, so the shop, the owner and the message are created together or not at all.
 */
@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_STORE) private readonly store: TenantStore,
    @Inject(CLOCK) private readonly clock: () => Date,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  async createTrialShop(
    tx: Transaction,
    request: TrialShopRequest,
  ): Promise<{ tenantId: string; messages: QueuedMessage[] }> {
    const plan = await this.store.findTrialPlan(tx);
    if (!plan) throw new Error('the Trial plan is not seeded');

    const trialDaysSetting = await this.settings.current(PlatformSettingKey.TrialDays);
    const trialDays =
      typeof trialDaysSetting?.value === 'number' ? trialDaysSetting.value : DEFAULT_TRIAL_DAYS;

    const now = this.clock();
    const tenantId = await this.store.insertTenant(tx, {
      ownerIdentityId: request.identityId,
      subscriberId: request.subscriberId,
      shopName: request.shopName,
      slug: request.slug,
      planId: plan.id,
      planSnapshot: plan.limits,
      periodStart: now,
      periodEnd: new Date(now.getTime() + trialDays * DAY_MS),
    });

    await this.staff.createOwner(tx, {
      tenantId,
      phone: request.ownerPhone,
      email: request.ownerEmail,
      name: request.ownerName,
    });
    if (request.ownerPhone === null) return { tenantId, messages: [] };
    const ready = await this.messaging.queueShopReady(tx, request.ownerPhone, request.liveUrl);
    return { tenantId, messages: [ready] };
  }

  /**
   * Locks a tenant's balance row for the rest of the transaction (BAL-11) — every concurrent charge against the
   * same tenant serializes here, so no two charges can read the same stale balance.
   */
  lockBalanceForUpdate(tx: Transaction, tenantId: string): Promise<BalanceRow | null> {
    return this.store.lockBalanceForUpdate(tx, tenantId);
  }

  /** BAL-07/08/09: freezes or unfreezes the balance without touching its amount. */
  setBalanceFrozen(tx: Transaction, tenantId: string, frozen: boolean): Promise<void> {
    return this.store.setBalanceFrozen(tx, tenantId, frozen);
  }

  /** Writes the new balance (and, optionally, the frozen flag and/or D2-11's last-activity timestamp). */
  applyBalanceChange(
    tx: Transaction,
    tenantId: string,
    amount: string,
    options?: { frozen?: boolean; touchActivityAt?: Date },
  ): Promise<void> {
    return this.store.applyBalanceChange(tx, tenantId, amount, options);
  }

  /** Opens a transaction for a caller that doesn't have one yet (control.tenants has no RLS/tenant context). */
  runStandalone<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.run(work);
  }

  /** PLN-17/TRL-07: activates a plan assignment with a normal snapshot; `state` is the caller's to decide. */
  applyPlanAssignment(
    tx: Transaction,
    tenantId: string,
    values: {
      planId: string;
      planSnapshot: PlanLimits;
      planVersionSnapshot: number;
      featureSnapshot: Record<string, boolean>;
      periodStart: Date;
      periodEnd: Date | null;
      state: TenantState;
      billingTermId?: string | null;
    },
  ): Promise<void> {
    return this.store.applyPlanAssignment(tx, tenantId, values);
  }

  /** BIL-17: toggles the owner's own "renew automatically from balance" setting. */
  setAutoRenew(tx: Transaction, tenantId: string, enabled: boolean): Promise<void> {
    return this.store.setAutoRenew(tx, tenantId, enabled);
  }

  /** DWN-11: protects the tenant's pre-downgrade retention until `until`. */
  setRetentionFloor(
    tx: Transaction,
    tenantId: string,
    floor: { days: number; until: Date },
  ): Promise<void> {
    return this.store.setRetentionFloor(tx, tenantId, floor);
  }

  /** TRL-07: the plan a trial converts to at day 30 with no purchase. */
  findPayAsYouGoPlan(tx: Transaction): Promise<{
    id: string;
    limits: PlanLimits;
    version: number;
    features: Record<string, boolean>;
  } | null> {
    return this.store.findPayAsYouGoPlan(tx);
  }

  /** TRL-07: trials whose period has ended with no purchase -- the trial-end job's candidate list. */
  findExpiredTrialIds(tx: Transaction, now: Date): Promise<string[]> {
    return this.store.findExpiredTrialIds(tx, now);
  }

  /** BIL-10/11: what a purchase/renewal confirmation needs to decide extend-vs-restart, read in its own tx. */
  findBillingInfo(tx: Transaction, tenantId: string): Promise<BillingInfoRow | null> {
    return this.store.findBillingInfo(tx, tenantId);
  }

  /** LIF-03/04/23, PYG-09: the state write; entering `archived` records `at`. Plan, period and balance are untouched. */
  setLifecycleState(
    tx: Transaction,
    tenantId: string,
    state: TenantState,
    at: Date,
  ): Promise<void> {
    return this.store.setLifecycleState(tx, tenantId, state, at);
  }

  /** PYG-09, LIF-24: back on pay-as-you-go after a suspension archived it, the idle clock restarting at `at`. */
  returnToPayAsYouGo(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    return this.store.returnToPayAsYouGo(tx, tenantId, at);
  }

  /** LIF-26: freezes today's stage lengths onto the tenant the first tick it's found lapsing. */
  setLapseScheduleSnapshot(
    tx: Transaction,
    tenantId: string,
    snapshot: Parameters<TenantStore['setLapseScheduleSnapshot']>[2],
  ): Promise<void> {
    return this.store.setLapseScheduleSnapshot(tx, tenantId, snapshot);
  }

  /** LIF-24: an operator closing the public/dashboard side for cause, independent of `state`. */
  setSuspension(tx: Transaction, tenantId: string, reason: string, at: Date): Promise<void> {
    return this.store.setSuspension(tx, tenantId, reason, at);
  }

  /** LIF-15/24: lifts a suspension -- restore (any plan activation) and operator restore both call this. */
  clearSuspension(tx: Transaction, tenantId: string): Promise<void> {
    return this.store.clearSuspension(tx, tenantId);
  }

  /** LIF-01: sets or clears the owner's own non-renewal intent. */
  setCancellation(tx: Transaction, tenantId: string, cancelledAt: Date | null): Promise<void> {
    return this.store.setCancellation(tx, tenantId, cancelledAt);
  }

  /** LIF-19: the day-60 deletion job's own state/marker write. */
  markDeleted(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    return this.store.markDeleted(tx, tenantId, at);
  }

  /** LIF-21: deleted tenants whose 30-day subdomain reservation has lapsed and whose slug isn't already revoked. */
  findRevocationCandidates(tx: Transaction, now: Date): Promise<RevocationCandidateRow[]> {
    return this.store.findRevocationCandidates(tx, now);
  }

  /** LIF-21: frees the literal slug string and clears the rest of the shop's identity/contact fields. */
  revokeExpiredTenant(tx: Transaction, tenantId: string, mangledSlug: string): Promise<void> {
    return this.store.revokeExpiredTenant(tx, tenantId, mangledSlug);
  }

  /** LIF-03/04: every tenant whose lifecycle state is derived from a running period, not yet deleted. */
  findLapsingCandidates(
    tx: Transaction,
    now: Date,
  ): Promise<Awaited<ReturnType<TenantStore['findLapsingCandidates']>>> {
    return this.store.findLapsingCandidates(tx, now);
  }

  /** BIL-14: still-`active` tenants whose period ends within [now, horizon]. */
  findUpcomingRenewalCandidates(
    tx: Transaction,
    now: Date,
    horizon: Date,
  ): Promise<Awaited<ReturnType<TenantStore['findUpcomingRenewalCandidates']>>> {
    return this.store.findUpcomingRenewalCandidates(tx, now, horizon);
  }

  /** PYG-21: every pay-as-you-go tenant, not yet deleted. */
  findPaygInactiveCandidates(
    tx: Transaction,
  ): Promise<Awaited<ReturnType<TenantStore['findPaygInactiveCandidates']>>> {
    return this.store.findPaygInactiveCandidates(tx);
  }

  /** PYG-21/LIF-19: tenants already archived by the inactivity pass, awaiting their own day-60 deletion. */
  findPaygArchivedCandidates(
    tx: Transaction,
  ): Promise<Awaited<ReturnType<TenantStore['findPaygArchivedCandidates']>>> {
    return this.store.findPaygArchivedCandidates(tx);
  }

  /** LIF-20/21: an account's deleted shops -- their invoices stay the owner's, their balance moves on. */
  findDeletedShopsOf(
    tx: Transaction,
    subscriberId: string,
  ): Promise<Awaited<ReturnType<TenantStore['findDeletedShopsOf']>>> {
    return this.store.findDeletedShopsOf(tx, subscriberId);
  }

  /** TEN-30: the owner's own contact phone/email/business address. */
  findContactDetails(tx: Transaction, tenantId: string): Promise<ContactDetailsRow | null> {
    return this.store.findContactDetails(tx, tenantId);
  }

  /** TEN-30: updates whichever fields the caller sent; an omitted key leaves its current value untouched. */
  updateContactDetails(
    tx: Transaction,
    tenantId: string,
    values: Partial<ContactDetailsRow>,
  ): Promise<void> {
    return this.store.updateContactDetails(tx, tenantId, values);
  }

  /** PST-01, PST-03: the shop's business type. Existing products keep their own settings. */
  setBusinessType(tx: Transaction, tenantId: string, businessType: string | null): Promise<void> {
    return this.store.setBusinessType(tx, tenantId, businessType);
  }
}
