import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LedgerEntryType,
  NotificationKind,
  PAYG_API_BLOCK,
  RateKey,
  TenantState,
} from '@lytronix/validators';
import { dhakaDate, HOUR_MS, usageCycleStart } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, rateToPaisa, toPaisa } from '../../balance/services/money';
import { RateService } from '../../balance/services/rate.service';
import { StorefrontActivation } from '../../balance/services/storefront-activation';
import { FairUseSwitch } from '../../fair-use/services/fair-use-switch';
import { NOTIFICATION_LINKS } from '../../notifications/notification-words';
import { Notifications } from '../../notifications/services/notifications';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { ApiUsageStore } from '../ports/api-key-store';
import { API_USAGE_STORE } from '../tokens';
import type { ApiShop, ApiUsageDay } from '../types/public-api';
import {
  admitsNext,
  CHARGE_WARNED,
  chargeWarning,
  dueBlocks,
  type ChargeFigures,
} from './api-charge-rules';
import { RequestQuota } from './request-quota';

/** PYG-26 (PF-36): the API page's figures for a pay-as-you-go shop's own website this cycle. */
export interface ApiChargeSummary {
  /** Whether the charge applies: fair use on, and the shop on pay-as-you-go. */
  applies: boolean;
  cycleStart: Date;
  /** Successful answers this cycle, the free ones, and the price of 1,000. */
  requests: number;
  free: number;
  rate: string;
  /** What this cycle was charged so far, and the seller's cap. */
  charged: string;
  cap: string;
  /** Answering stopped at the cap or for the balance. */
  stopped: boolean;
  days: ApiUsageDay[];
}

/**
 * PYG-26 (PAYG-FAIR-USE-PLAN PF-14, PF-36, PF-37, PFQ-10, PFQ-11): what a pay-as-you-go shop's own website pays for the
 * API, with fair use on. The first 10,000 successful answers a cycle are free; then ৳1 per 1,000, charged once a day in
 * whole 1,000s as one ledger line, up to the seller's cap and never past the balance. Past the cap, or the balance short
 * of the 1,000s not yet charged, the API answers that the limit is reached -- placing an order, the estimate and
 * locations still served and never charged past the cap (QTA-07). Its storefront and landing pages are never counted.
 */
@Injectable()
export class ApiCharges {
  private readonly logger = new Logger('ApiCharges');

  constructor(
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(API_USAGE_STORE) private readonly store: ApiUsageStore,
    @Inject(FairUseSwitch) private readonly fairUse: FairUseSwitch,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(StorefrontActivation) private readonly activation: StorefrontActivation,
    @Inject(Notifications) private readonly notifications: Notifications,
  ) {}

  /** Whether the charge replaces the plan's request limit for this shop. */
  async applies(state: TenantState): Promise<boolean> {
    return state === TenantState.PayAsYouGo && (await this.fairUse.isOn());
  }

  /** PF-14: whether the shop's own website may have one more request answered now. */
  async admits(shop: ApiShop, now: Date): Promise<boolean> {
    const cycleStart = usageCycleStart(shop.row, now);
    const state = await this.quota.chargeState(shop.row.id, cycleStart, now);
    const figures = await this.figures(state, shop.row.apiMonthlyCap, shop.row.balanceAmount);
    return admitsNext(figures);
  }

  /** PF-36: the API page's figures for a shop, read as they stand. */
  async summaryFor(tenantId: string, now: Date): Promise<ApiChargeSummary> {
    const { info, held } = await this.tenants.runStandalone(async (tx) => ({
      info: await this.tenants.findBillingInfo(tx, tenantId),
      held: await this.balance.heldWithin(tx, tenantId),
    }));
    if (!info) throw new Error('the shop has no billing info');
    return this.summary(
      {
        id: tenantId,
        state: info.state,
        periodStart: info.periodStart,
        createdAt: info.createdAt,
        apiMonthlyCap: info.apiMonthlyCap,
      },
      held.frozen ? '0' : held.amount,
      now,
    );
  }

  /** PF-36: the API page's figures. */
  async summary(
    shop: {
      id: string;
      state: TenantState;
      periodStart: Date | null;
      createdAt: Date;
      apiMonthlyCap: string;
    },
    balance: string,
    now: Date,
  ): Promise<ApiChargeSummary> {
    const cycleStart = usageCycleStart(shop, now);
    const [state, row, days, free, rate] = await Promise.all([
      this.quota.chargeState(shop.id, cycleStart, now),
      this.store.find(shop.id, cycleStart),
      this.store.listDays(shop.id, cycleStart),
      this.fairUse.freeRequests(),
      this.rates.current(RateKey.PaygApiPerThousand),
    ]);
    const figures = await this.figures(state, shop.apiMonthlyCap, balance);
    return {
      applies: await this.applies(shop.state),
      cycleStart,
      requests: state.billable,
      free,
      rate: rate?.value ?? '0',
      charged: row?.charged ?? '0.00',
      cap: shop.apiMonthlyCap,
      stopped: !admitsNext(figures),
      days,
    };
  }

  /**
   * PF-14: the day's charge, from the daily job -- for every pay-as-you-go shop, the whole 1,000s past the free allowance
   * not charged yet, within the cap and the balance, as one ledger line; then the warnings now due (PF-36). With fair use
   * off, nothing. Also marks activated the shops that paid since (PFQ-9), so none is paused by mistake.
   */
  async chargeDay(now: Date): Promise<{ charged: number; activated: number }> {
    if (!(await this.fairUse.isOn())) return { charged: 0, activated: 0 };
    const activated = await this.tenants.runStandalone((tx) =>
      this.activation.markPaidShopsWithin(tx, now),
    );
    // The requests charged are yesterday's, in the cycle yesterday fell in.
    const at = new Date(now.getTime() - HOUR_MS);
    const shops = await this.tenants.runStandalone((tx) => this.tenants.listPayAsYouGo(tx));
    let charged = 0;
    for (const shop of shops) {
      try {
        if (await this.chargeShop(shop, at)) charged += 1;
      } catch (error) {
        this.logger.error(`could not charge ${shop.id}'s API requests`, error as Error);
      }
    }
    return { charged, activated };
  }

  /** PF-36 (PFQ-10): the seller's cap for the cycle; the API page's figures as they now stand. */
  async setCap(tenantId: string, cap: string): Promise<void> {
    await this.tenants.runStandalone((tx) => this.tenants.setApiMonthlyCap(tx, tenantId, cap));
  }

  private async chargeShop(
    shop: {
      id: string;
      state: TenantState;
      periodStart: Date | null;
      createdAt: Date;
      apiMonthlyCap: string;
    },
    at: Date,
  ): Promise<boolean> {
    const cycleStart = usageCycleStart(shop, at);
    const day = dhakaDate(at);
    return this.store.run(async (tx) => {
      const cycle = await this.store.lockCycle(tx, shop.id, cycleStart);
      const held = await this.balance.heldWithin(tx, shop.id);
      const figures = await this.figures(
        { billable: cycle.billable, billedBlocks: cycle.billedBlocks },
        shop.apiMonthlyCap,
        held.frozen ? '0' : held.amount,
      );
      const blocks = dueBlocks(figures);
      let chargedPaisa = toPaisa(cycle.charged);
      if (blocks > 0) {
        const amountPaisa = BigInt(blocks) * figures.ratePaisa;
        const rate = fromPaisa(figures.ratePaisa);
        await this.balance.charge(tx, {
          tenantId: shop.id,
          type: LedgerEntryType.ApiRequests,
          amount: fromPaisa(amountPaisa),
          units: String(blocks * PAYG_API_BLOCK),
          rateUsed: rate,
          reference: {
            cycleStart: cycleStart.toISOString(),
            day,
            requests: cycle.billable,
            blocks,
            rate,
          },
        });
        await this.store.recordCharge(tx, shop.id, cycleStart, day, blocks, fromPaisa(amountPaisa));
        chargedPaisa += amountPaisa;
      }
      const after = { ...figures, billedBlocks: figures.billedBlocks + blocks };
      const level = chargeWarning(after, chargedPaisa);
      if (level > cycle.chargeWarned) {
        await this.store.setChargeWarned(tx, shop.id, cycleStart, level);
        await this.warn(shop.id, level);
      }
      return blocks > 0;
    });
  }

  private async figures(
    state: { billable: number; billedBlocks: number },
    cap: string,
    balance: string,
  ): Promise<ChargeFigures> {
    const [free, rate] = await Promise.all([
      this.fairUse.freeRequests(),
      this.rates.current(RateKey.PaygApiPerThousand),
    ]);
    return {
      billable: state.billable,
      billedBlocks: state.billedBlocks,
      free,
      ratePaisa: rateToPaisa(rate?.value ?? '0'),
      capPaisa: toPaisa(cap),
      balancePaisa: toPaisa(balance) > 0n ? toPaisa(balance) : 0n,
    };
  }

  /** PF-36: in the app and by push, never by SMS (which would itself cost). */
  private async warn(tenantId: string, level: number): Promise<void> {
    const text =
      level === CHARGE_WARNED.stopped
        ? {
            bn: {
              title: 'API বন্ধ',
              body: 'এ মাসের API খরচের লিমিট বা ব্যালেন্স শেষ, তাই আপনার ওয়েবসাইটের API উত্তর দিচ্ছে না। লিমিট বাড়ান বা টপ-আপ করুন।',
            },
            en: {
              title: 'API stopped',
              body: "This month's API spending limit or your balance ran out, so your website's API has stopped. Raise the limit or top up.",
            },
          }
        : level === CHARGE_WARNED.nearCap
          ? {
              bn: {
                title: 'API খরচ লিমিটের ৮০%',
                body: 'এ মাসে API-তে খরচ লিমিটের ৮০% ছুঁয়েছে। লিমিটে পৌঁছালে API বন্ধ হবে।',
              },
              en: {
                title: 'API spending at 80% of the limit',
                body: "This month's API spending reached 80% of your limit. At the limit the API stops.",
              },
            }
          : {
              bn: {
                title: 'ফ্রি API রিকোয়েস্ট শেষ',
                body: 'এ মাসের ফ্রি রিকোয়েস্ট শেষ। এখন থেকে প্রতি ১,০০০ রিকোয়েস্টে চার্জ হবে।',
              },
              en: {
                title: 'Free API requests used',
                body: "This month's free requests are used. From now on every 1,000 requests is charged.",
              },
            };
    await this.notifications.notify({
      tenantId,
      kind: NotificationKind.UsageWarning,
      text,
      link: NOTIFICATION_LINKS.apiKeys,
    });
  }
}
