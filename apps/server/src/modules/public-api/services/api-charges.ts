import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { LedgerEntryType, NotificationKind, RateKey, TenantState } from '@lytronix/validators';
import type { MailWords } from '../../../common/i18n/bilingual';
import { dhakaDate, HOUR_MS, usageCycleStart } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, rateToPaisa, toPaisa } from '../../balance/services/money';
import { RateService } from '../../balance/services/rate.service';
import { StorefrontActivation } from '../../balance/services/storefront-activation';
import { FairUseSwitch } from '../../fair-use/services/fair-use-switch';
import { NOTIFICATION_LINKS, type NotificationText } from '../../notifications/notification-words';
import { AccountNotices } from '../../notifications/services/account-notices';
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

/**
 * PF-36: what a charge warning says -- in the bell and by push at every level, and by email to the owner at 80% of the
 * cap and at the stop it warns of (`mail` null below that). Never by SMS, which would itself cost.
 */
export function apiChargeWarningWords(
  level: number,
  spent: { charged: string; cap: string },
): { bell: NotificationText; mail: MailWords | null } {
  if (level === CHARGE_WARNED.stopped) {
    return {
      bell: {
        bn: {
          title: 'API বন্ধ',
          body: 'এ মাসের API খরচের লিমিট বা ব্যালেন্স শেষ, তাই আপনার ওয়েবসাইটের API উত্তর দিচ্ছে না। লিমিট বাড়ান বা টপ-আপ করুন।',
        },
        en: {
          title: 'API stopped',
          body: "This month's API spending limit or your balance ran out, so your website's API has stopped. Raise the limit or top up.",
        },
      },
      mail: {
        bn: {
          subject: 'আপনার ওয়েবসাইটের API বন্ধ',
          body:
            `এ মাসের API খরচের লিমিট বা ব্যালেন্স শেষ (খরচ ${spent.charged} TK, লিমিট ${spent.cap} TK), তাই আপনার ` +
            'ওয়েবসাইটের API উত্তর দিচ্ছে না। অর্ডার নেওয়া চালু আছে। আবার চালু করতে ড্যাশবোর্ডের সেটিংস → API কী থেকে ' +
            'লিমিট বাড়ান, অথবা ব্যালেন্স টপ-আপ করুন।',
        },
        en: {
          subject: "Your website's API has stopped",
          body:
            `This month's API spending limit or your balance ran out (spent ${spent.charged} TK, limit ${spent.cap} TK), ` +
            "so your website's API has stopped answering. Orders are still taken. To start it again, raise the limit " +
            'under Settings → API keys in the dashboard, or top up your balance.',
        },
      },
    };
  }
  if (level === CHARGE_WARNED.nearCap) {
    return {
      bell: {
        bn: {
          title: 'API খরচ লিমিটের ৮০%',
          body: 'এ মাসে API-তে খরচ লিমিটের ৮০% ছুঁয়েছে। লিমিটে পৌঁছালে API বন্ধ হবে।',
        },
        en: {
          title: 'API spending at 80% of the limit',
          body: "This month's API spending reached 80% of your limit. At the limit the API stops.",
        },
      },
      mail: {
        bn: {
          subject: 'API খরচ লিমিটের ৮০% ছুঁয়েছে',
          body:
            `এ মাসে আপনার ওয়েবসাইটের API-তে খরচ লিমিটের ৮০% ছুঁয়েছে: ${spent.charged} TK, লিমিট ${spent.cap} TK। ` +
            'লিমিটে পৌঁছালে API উত্তর দেওয়া বন্ধ হবে, অর্ডার নেওয়া চালু থাকবে। লিমিট বাড়াতে ড্যাশবোর্ডের ' +
            'সেটিংস → API কী দেখুন।',
        },
        en: {
          subject: 'API spending at 80% of your limit',
          body:
            `Your website's API spending this month reached 80% of your limit: ${spent.charged} TK of ${spent.cap} TK. ` +
            'At the limit the API stops answering; orders are still taken. To raise the limit, open Settings → API ' +
            'keys in the dashboard.',
        },
      },
    };
  }
  return {
    bell: {
      bn: {
        title: 'ফ্রি API রিকোয়েস্ট শেষ',
        body: 'এ মাসের ফ্রি রিকোয়েস্ট শেষ। এখন থেকে প্রতি ১,০০০ রিকোয়েস্টে চার্জ হবে।',
      },
      en: {
        title: 'Free API requests used',
        body: "This month's free requests are used. From now on every 1,000 requests is charged.",
      },
    },
    mail: null,
  };
}

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
    @Inject(AccountNotices) private readonly notices: AccountNotices,
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
        this.logger.error(
          `could not charge ${shop.id}'s API requests: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
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
          // Charged as whole 1,000s at the price of 1,000: the ledger works the amount out from the two.
          units: String(blocks),
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
        await this.warn(tx, shop.id, level, {
          charged: fromPaisa(chargedPaisa),
          cap: fromPaisa(figures.capPaisa),
        });
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

  /**
   * PF-36: in the app and by push, never by SMS (which would itself cost). The 80% warning, and the stop it warns of,
   * also go to the owner by email, in the charge's own transaction.
   */
  private async warn(
    tx: Transaction,
    tenantId: string,
    level: number,
    spent: { charged: string; cap: string },
  ): Promise<void> {
    const words = apiChargeWarningWords(level, spent);
    if (words.mail) {
      await this.notices.send(
        tx,
        tenantId,
        NotificationKind.UsageWarning,
        words.mail,
        NOTIFICATION_LINKS.apiKeys,
        words.bell,
      );
      return;
    }
    await this.notifications.notify({
      tenantId,
      kind: NotificationKind.UsageWarning,
      text: words.bell,
      link: NOTIFICATION_LINKS.apiKeys,
    });
  }
}
