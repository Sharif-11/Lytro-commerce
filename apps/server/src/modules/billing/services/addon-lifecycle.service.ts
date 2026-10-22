import { Inject, Injectable } from '@nestjs/common';
import type { BillingInfoRow } from '@lytronix/db';
import {
  ActorType,
  ADDON_WARNING_DAYS,
  AddonKind,
  AddonPurchaseStatus,
  AddonRenewal,
  AuditAction,
  AuditResult,
  isUsageLimitKey,
  limitOf,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS, daysUntil, dhakaDate } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { MailService } from '../../shared/mail/services/mail.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE } from '../tokens';
import type { RenewingAddon } from '../types/addon';
import { AddonPurchaseService } from './addon-purchase.service';
import {
  AddonRenewalService,
  NOT_RENEWING,
  renewalBar,
  withPlanPeriod,
} from './addon-renewal.service';
import { ShopLimitsService } from './shop-limits.service';

/** What one add-on tick did. */
export interface AddonTickResult {
  cancelled: number;
  renewed: number;
  lapsed: number;
  warned: number;
}

/** These add-ons, by the shop they belong to, each shop's in their order. */
function byShop(rows: readonly RenewingAddon[]): Map<string, RenewingAddon[]> {
  const shops = new Map<string, RenewingAddon[]>();
  for (const row of rows) shops.set(row.tenantId, [...(shops.get(row.tenantId) ?? []), row]);
  return shops;
}

/** How an add-on is named in a notice: its label, and how many when more than one. */
function nameOf(addon: RenewingAddon): string {
  return addon.quantity === 1 ? addon.labelEn : `${addon.labelEn} x${String(addon.quantity)}`;
}

/**
 * PLN-14: the add-ons' part of the recurring lifecycle tick (D2-6), after the plans' own. Four passes, each its own query
 * of what is due: quotes no one is waiting on are cancelled (BIL-15); an add-on that does not renew with the plan --
 * one of pay-as-you-go's or a no-expiry plan's own 30 days, or one carried over from them onto a plan -- is renewed from
 * the balance at its end; an add-on that ended with nothing continuing it lapses; and the owner is warned, 7 and 1 days
 * ahead, of one that will not renew.
 */
@Injectable()
export class AddonLifecycleService {
  constructor(
    @Inject(ADDONS_STORE) private readonly store: AddonsStore,
    @Inject(AddonPurchaseService) private readonly purchases: AddonPurchaseService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(ShopLimitsService) private readonly shopLimits: ShopLimitsService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(TenantCache) private readonly tenantCache: TenantCache,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async runTick(now: Date): Promise<AddonTickResult> {
    const cancelled = await this.store.run((tx) => this.store.cancelForStalePayments(tx));
    const renewed = await this.renewEnded(now);
    const lapsed = await this.lapseEnded();
    const warned = await this.sendWarnings(now);
    return { cancelled, renewed, lapsed, warned };
  }

  /**
   * PLN-14: each ended add-on set to renew that does not renew with the plan's payment is renewed from the balance for
   * its next period, oldest first. One the balance does not reach is left to lapse, and the owner is told how short it
   * was (PYG-10's switch from a plan carries the plan's renewing add-ons into their own periods this way). How many.
   */
  private async renewEnded(now: Date): Promise<number> {
    const ended = await this.store.run((tx) =>
      this.store.listEnded(tx, [AddonPurchaseStatus.Pending, AddonPurchaseStatus.Active]),
    );
    let renewed = 0;
    for (const [tenantId, rows] of byShop(ended)) {
      const info = await this.billingOf(tenantId);
      const plan = await this.renewals.planFor(tenantId, {
        limits: info?.planSnapshot ?? null,
        features: info?.featureSnapshot ?? {},
      });
      const short: { from: RenewingAddon; price: string }[] = [];
      for (const row of rows) {
        // One that ends with the plan's period renews with the plan, or lapses with it -- never here.
        if (!row.renews || withPlanPeriod(row, info) || renewalBar(row, plan)) continue;
        const next = await this.renewals.nextOwnPeriod(info, row, now);
        if (!next) continue;
        try {
          await this.purchases.renewFromBalance(row, next, now);
          renewed += 1;
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          short.push({ from: row, price: next.price });
        }
      }
      if (short.length > 0) {
        const balance = toPaisa((await this.balance.current(tenantId)).amount);
        const owed = short.reduce((sum, carry) => sum + toPaisa(carry.price), 0n);
        await this.renewals.tellNotRenewed(tenantId, short, owed - balance);
      }
    }
    return renewed;
  }

  /**
   * PLN-14: every add-on that ended with nothing continuing it lapses -- its renewal off, its item retired, the balance
   * short, or its shop out of grace -- with an entry in the shop's log, and the shop's cached limits dropped so the
   * storefront sees them at once (a lapsed brand identity reverts the look, BRN-05). How many.
   */
  private async lapseEnded(): Promise<number> {
    const ended = await this.store.run((tx) =>
      this.store.listEnded(tx, [AddonPurchaseStatus.Active]),
    );
    for (const [tenantId, rows] of byShop(ended)) {
      await this.tenants.runStandalone(async (tx) => {
        for (const row of rows) {
          await this.store.lapse(tx, row.id);
          await this.audit.record(tx, {
            tenantId,
            actorType: ActorType.System,
            actorId: null,
            action: AuditAction.AddonLapsed,
            targetType: 'addon_purchase',
            targetId: row.id,
            result: AuditResult.Success,
            summary: { key: row.key, quantity: row.quantity, endedAt: row.expiresAt },
          });
        }
      });
      this.tenantCache.invalidateTenant(tenantId);
    }
    return ended.length;
  }

  /**
   * PLN-14: 7 and 1 days before an add-on ends, the owner is told by email -- never by SMS -- when it will not renew:
   * its renewal is off, its item retired, the plan leaves it nothing to raise, or the balance is short. Each warning
   * once per add-on period, recorded in the shop's log whether or not an email went. How many.
   */
  private async sendWarnings(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...ADDON_WARNING_DAYS) * DAY_MS);
    const ending = await this.store.run((tx) => this.store.listEndingBy(tx, horizon));
    const tightestFirst = [...ADDON_WARNING_DAYS].sort((a, b) => a - b);
    let warned = 0;
    for (const [tenantId, rows] of byShop(ending)) {
      const info = await this.billingOf(tenantId);
      const outlook = await this.renewals.outlook(tenantId, info, rows, now);
      const sent = await this.warningsSent(tenantId);
      for (const row of rows) {
        const renewal = outlook.get(row.id);
        if (!renewal || !NOT_RENEWING.has(renewal)) continue;
        const day = tightestFirst.find((days) => daysUntil(now, row.expiresAt) <= days);
        if (day === undefined || sent.has(`${row.id}:${String(day)}`)) continue;
        await this.warn(tenantId, row, renewal, day, info);
        warned += 1;
      }
    }
    return warned;
  }

  /** The warnings already sent for the shop's add-ons, as `purchase:day`. */
  private async warningsSent(tenantId: string): Promise<Set<string>> {
    const entries = await this.audit.list(
      tenantId,
      { action: AuditAction.AddonEndingWarned },
      null,
      100,
    );
    return new Set(
      entries.entries.flatMap((entry) => {
        const summary = entry.summary as { day?: number } | null;
        return summary?.day === undefined || entry.targetId === null
          ? []
          : [`${entry.targetId}:${String(summary.day)}`];
      }),
    );
  }

  private async warn(
    tenantId: string,
    row: RenewingAddon,
    renewal: AddonRenewal,
    day: number,
    info: BillingInfoRow | null,
  ): Promise<void> {
    const body =
      `${nameOf(row)} ends on ${dhakaDate(row.expiresAt)} and will not renew: ` +
      (await this.whyNot(tenantId, row, renewal, info));
    const contact = await this.staff.ownerContact(tenantId);
    await this.tenants.runStandalone(async (tx) => {
      if (contact?.email) {
        await this.mail.queueLifecycleNotice(tx, contact.email, 'An add-on ends soon', body);
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.AddonEndingWarned,
        targetType: 'addon_purchase',
        targetId: row.id,
        result: AuditResult.Success,
        summary: { day, key: row.key, renewal, endsAt: row.expiresAt },
      });
    });
  }

  /** PLN-14: why an add-on will not renew, in the warning's words -- and for a retired item, what its limit returns to. */
  private async whyNot(
    tenantId: string,
    row: RenewingAddon,
    renewal: AddonRenewal,
    info: BillingInfoRow | null,
  ): Promise<string> {
    if (renewal === AddonRenewal.Off) {
      return 'its renewal is switched off. Switch it on from the add-ons page to keep it.';
    }
    if (renewal === AddonRenewal.Unlimited) {
      return 'your plan no longer limits what it adds, so it is not needed.';
    }
    if (renewal === AddonRenewal.BalanceShort) {
      const next = await this.renewals.nextOwnPeriod(info, row, row.expiresAt);
      const balance = toPaisa((await this.balance.current(tenantId)).amount);
      const price = next ? toPaisa(next.price) : 0n;
      return price > balance
        ? `your balance is ${fromPaisa(price - balance)} TK short of renewing it. Top up to keep it.`
        : 'your balance is too short to renew it with your plan. Top up to keep it.';
    }
    if (row.kind === AddonKind.Feature)
      return 'it is no longer sold, and switches off when it ends.';
    const limits = await this.shopLimits.of(tenantId, info?.planSnapshot ?? null);
    const limit =
      row.limitKey !== null && isUsageLimitKey(row.limitKey) ? limitOf(limits, row.limitKey) : null;
    const after = limit === null ? null : limit - row.quantity * (row.unitSize ?? 0);
    return after === null
      ? 'it is no longer sold.'
      : `it is no longer sold. Your limit goes back to ${String(after)} when it ends.`;
  }

  private billingOf(tenantId: string): Promise<BillingInfoRow | null> {
    return this.tenants.runStandalone((tx) => this.tenants.findBillingInfo(tx, tenantId));
  }
}
