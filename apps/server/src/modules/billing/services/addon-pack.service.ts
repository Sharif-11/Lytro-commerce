import { Inject, Injectable } from '@nestjs/common';
import type { BillingInfoRow, Transaction } from '@lytronix/db';
import {
  ActorType,
  AddonKind,
  AuditAction,
  AuditResult,
  InvoiceKind,
  InvoiceLineKind,
  LedgerEntryType,
  limitOf,
  PACK_AUTO_BUY_CAP,
  PACK_NEVER_ENDS,
  PackAutoBuyState,
  PlanPaymentKind,
  PlanPaymentStatus,
  UsageMetric,
  type BuyPacksInput,
  type SetPackAutoBuyInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { usageCycleStart } from '../../../common/time';
import { packTaken } from '../../../common/usage-warnings';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { GB, MediaBandwidth } from '../../media/services/media-bandwidth';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import { RequestQuota } from '../../public-api/services/request-quota';
import { MailService } from '../../shared/mail/services/mail.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { PackAutoBuy } from '../../usage-warnings/types/pack-auto-buy';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE, CLOCK } from '../tokens';
import type { AddonPurchaseResult, AddonRecord, ShopPack } from '../types/addon';
import { canTake } from './addon-eligibility';
import { ShopLimitsService } from './shop-limits.service';

/** The metered limit a pack tops up, for each metric that has packs. */
const PACK_METRICS = {
  bandwidth_gb: UsageMetric.Bandwidth,
  requests_monthly: UsageMetric.Requests,
} as const;

type PackMetric = (typeof PACK_METRICS)[keyof typeof PACK_METRICS];

/** BND-04, RTE-11: the metric a pack tops up, or null for an item that is no pack. */
function metricOf(addon: AddonRecord): PackMetric | null {
  if (addon.kind !== AddonKind.Pack || addon.limitKey === null) return null;
  return addon.limitKey in PACK_METRICS
    ? PACK_METRICS[addon.limitKey as keyof typeof PACK_METRICS]
    : null;
}

/** A whole-taka price as a notice says it: 30, not 30.00. */
function taka(price: string): string {
  return String(Number(price));
}

/** How a pack is named in a notice: its label, and how many when more than one. */
function nameOf(addon: AddonRecord, quantity: number): string {
  return quantity === 1 ? addon.labelEn : `${addon.labelEn} x${String(quantity)}`;
}

/**
 * PLN-15, BND-04, RTE-11: bandwidth and request packs. A pack is bought from the balance only -- by one tap, or by
 * auto-buy when the cycle's allowance is reached -- and is used up rather than outlived: what a cycle uses past the
 * shop's own limit is taken from its packs, and what is left carries over. The counting passes (`MediaBandwidth`,
 * `RequestQuota`) keep each cycle's share and ask for auto-buy's packs; this buys them.
 */
@Injectable()
export class AddonPackService {
  constructor(
    @Inject(ADDONS_STORE) private readonly store: AddonsStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(ShopLimitsService) private readonly shopLimits: ShopLimitsService,
    @Inject(MediaBandwidth) private readonly bandwidth: MediaBandwidth,
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * PLN-15: buys packs from the balance at once -- a pack's price is fixed, so there is no quote to hold -- with its
   * invoice and the shop's log entry. A shop that may buy add-ons may buy packs (PLN-14); the balance pays, never a wallet.
   */
  async buy(
    tenantId: string,
    input: BuyPacksInput,
    ip?: string | null,
  ): Promise<AddonPurchaseResult> {
    const now = this.clock();
    const addon = await this.store.run((tx) => this.store.findById(tx, input.addonId));
    if (!addon || addon.retiredAt || metricOf(addon) === null) {
      throw new ApiError('not_found', 'AddonNotFound', {});
    }
    const info = await this.billingOf(tenantId);
    if (!canTake(info, now))
      throw new ApiError('plan_feature_unavailable', 'AddonNotAvailable', {});
    return this.tenants.runStandalone((tx) =>
      this.purchase(tx, tenantId, info, addon, input.quantity, now, ActorType.User, ip ?? null),
    );
  }

  /**
   * BND-04, RTE-11: buys the pack the counting pass asked for when the cycle's allowance was reached -- one, while
   * auto-buy is still on, the shop may still buy and the cycle's cap is not reached. When the balance is short the cycle
   * stops asking until a pack is bought, and the owner is told; when it buys, the owner is told too.
   */
  async autoBuy(job: PackAutoBuy): Promise<void> {
    const now = this.clock();
    const cycleStart = new Date(job.cycleStart);
    const meter = job.metric === UsageMetric.Bandwidth ? this.bandwidth : this.quota;
    const info = await this.billingOf(job.tenantId);
    const on =
      job.metric === UsageMetric.Bandwidth ? info?.autoBuyBandwidth : info?.autoBuyRequests;
    const pack = (await this.store.run((tx) => this.store.list(tx, false))).find(
      (addon) => metricOf(addon) === job.metric,
    );
    let bought: { autoPacks: number; pack: AddonRecord } | null = null;
    try {
      bought = await this.tenants.runStandalone(async (tx) => {
        const state = await meter.autoBuyOf(tx, job.tenantId, cycleStart);
        if (state.autoBuyState !== PackAutoBuyState.Requested) return null;
        const due =
          on === true &&
          pack !== undefined &&
          canTake(info, now) &&
          state.autoPacks < PACK_AUTO_BUY_CAP &&
          usageCycleStart(info, now).getTime() === cycleStart.getTime();
        if (!due) {
          await meter.autoBuyDone(tx, job.tenantId, cycleStart, 'skipped');
          return null;
        }
        await this.purchase(tx, job.tenantId, info, pack, 1, now, ActorType.System, null);
        await meter.autoBuyDone(tx, job.tenantId, cycleStart, 'bought');
        return { autoPacks: state.autoPacks + 1, pack };
      });
    } catch (error) {
      if (!(error instanceof ApiError) || !pack) throw error;
      await this.failed(job, cycleStart, pack);
      return;
    }
    if (bought) {
      await this.tell(
        job.tenantId,
        'Auto-buy bought a pack',
        `Auto-buy bought a ${bought.pack.labelEn} for ${taka(bought.pack.price)} TK from your balance ` +
          `(${String(bought.autoPacks)} of ${String(PACK_AUTO_BUY_CAP)} this cycle).`,
      );
    }
  }

  /** PLN-15: the owner switches auto-buy of bandwidth or request packs on or off. The packs as they now stand. */
  async setAutoBuy(
    tenantId: string,
    input: SetPackAutoBuyInput,
    ip?: string | null,
  ): Promise<ShopPack[]> {
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setPackAutoBuy(tx, tenantId, {
        autoBuyBandwidth: input.bandwidth,
        autoBuyRequests: input.requests,
      });
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.PackAutoBuySet,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { bandwidth: input.bandwidth ?? null, requests: input.requests ?? null },
      });
    });
    return this.packsOf(tenantId);
  }

  /** BND-04, RTE-11, PLN-15: what is left of the shop's packs, by metric, and whether auto-buy is on for each. */
  async packsOf(tenantId: string): Promise<ShopPack[]> {
    const now = this.clock();
    const info = await this.billingOf(tenantId);
    if (!info) return [];
    const cycleStart = usageCycleStart(info, now);
    const [bandwidth, requests, used, limits] = await Promise.all([
      this.bandwidth.usage(tenantId),
      this.quota.packsOf(tenantId, cycleStart),
      this.quota.used(tenantId, cycleStart, now),
      this.shopLimits.of(tenantId, info.planSnapshot),
    ]);
    const limit = limitOf(limits, 'requests_monthly');
    return [
      {
        metric: UsageMetric.Bandwidth,
        left: bandwidth.packLeftBytes,
        autoBuy: info.autoBuyBandwidth,
      },
      {
        metric: UsageMetric.Requests,
        left: requests.packs.available - packTaken(used, limit, requests.packs),
        autoBuy: info.autoBuyRequests,
      },
    ];
  }

  /**
   * LIM-01 (agreed in Slice 10): the metrics the shop bought packs for in each of its last two cycles, so the suggestion
   * leads with the next plan for them.
   */
  async boughtTwoCyclesRunning(
    tenant: { id: string } & Parameters<typeof usageCycleStart>[0],
    now: Date,
  ): Promise<Set<UsageMetric>> {
    const current = usageCycleStart(tenant, now);
    const previous = usageCycleStart(tenant, new Date(current.getTime() - 1));
    const bought = await this.store.run((tx) =>
      this.store.listPackPurchases(tx, tenant.id, previous),
    );
    const metrics = new Set<UsageMetric>();
    for (const [limitKey, metric] of Object.entries(PACK_METRICS)) {
      const times = bought.filter((row) => row.limitKey === limitKey).map((row) => row.purchasedAt);
      if (times.some((at) => at < current) && times.some((at) => at >= current))
        metrics.add(metric);
    }
    return metrics;
  }

  /**
   * One purchase of `quantity` packs from the balance, in `tx`: the payment, the charge, the pack itself, its invoice and
   * the log entry, and the counting pass told so the pack counts at once (and a grace already used stays free).
   */
  private async purchase(
    tx: Transaction,
    tenantId: string,
    info: BillingInfoRow,
    addon: AddonRecord,
    quantity: number,
    now: Date,
    actorType: ActorType,
    ip: string | null,
  ): Promise<AddonPurchaseResult> {
    const amount = fromPaisa(toPaisa(addon.price) * BigInt(quantity));
    const payment = await this.payments.quote(tx, {
      tenantId,
      kind: PlanPaymentKind.Addon,
      planId: null,
      billingTermId: null,
      amount,
      creditAmount: '0',
    });
    const purchase = await this.store.insertPurchase(tx, {
      tenantId,
      addonId: addon.id,
      kind: addon.kind,
      limitKey: addon.limitKey,
      unitSize: addon.unitSize,
      quantity,
      price: amount,
      paidFrom: 'balance',
      planPaymentId: payment.id,
      startsAt: now,
      expiresAt: PACK_NEVER_ENDS,
    });
    await this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.Addon,
      amount,
      reference: { planPaymentId: payment.id },
    });
    await this.payments.markVerifiedDirect(tx, payment.id, now);
    await this.store.activatePurchase(tx, purchase.id, {
      startsAt: now,
      expiresAt: PACK_NEVER_ENDS,
      paidFrom: 'balance',
    });
    const units = quantity * (addon.unitSize ?? 0);
    if (metricOf(addon) === UsageMetric.Bandwidth) {
      await this.bandwidth.packBought(tx, tenantId, info, units * GB, now);
    } else {
      const limits = await this.shopLimits.of(tenantId, info.planSnapshot);
      await this.quota.packBought(
        tx,
        tenantId,
        info,
        limitOf(limits, 'requests_monthly'),
        units,
        now,
      );
    }

    const owner = await this.staff.ownerContactIn(tx, tenantId);
    const invoice = await this.invoices.issue(
      tx,
      {
        tenantId,
        kind: InvoiceKind.Addon,
        planSnapshot: null,
        amount,
        creditAmount: '0',
        billingTermLabel: null,
        shopName: info.shopName,
        ownerName: owner?.name ?? null,
        planName: null,
        planVersion: null,
        periodStart: null,
        periodEnd: null,
        discountAmount: '0',
        paymentMethod: 'balance',
        paymentReference: null,
        planPaymentId: payment.id,
      },
      [{ kind: InvoiceLineKind.Addon, description: addon.labelEn, quantity, amount }],
    );
    await this.audit.record(tx, {
      tenantId,
      actorType,
      actorId: null,
      action: AuditAction.AddonPurchased,
      ip,
      targetType: 'addon_purchase',
      targetId: purchase.id,
      result: AuditResult.Success,
      summary: { key: addon.key, quantity, amount, invoiceNumber: invoice.number },
    });
    return {
      payment: { ...payment, status: PlanPaymentStatus.Verified, verifiedAt: now },
      invoice,
    };
  }

  /** BND-04: the balance was short of auto-buy's pack -- the cycle stops asking, the log says so, and the owner is told. */
  private async failed(job: PackAutoBuy, cycleStart: Date, pack: AddonRecord): Promise<void> {
    const meter = job.metric === UsageMetric.Bandwidth ? this.bandwidth : this.quota;
    const { amount } = await this.balance.current(job.tenantId);
    await this.tenants.runStandalone(async (tx) => {
      await meter.autoBuyDone(tx, job.tenantId, cycleStart, 'failed');
      await this.audit.record(tx, {
        tenantId: job.tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.PackAutoBuyFailed,
        targetType: 'tenant',
        targetId: job.tenantId,
        result: AuditResult.Failure,
        summary: { key: pack.key, price: pack.price, balance: amount },
      });
    });
    const short = fromPaisa(toPaisa(pack.price) - toPaisa(amount));
    await this.tell(
      job.tenantId,
      'Auto-buy could not buy a pack',
      `Auto-buy could not buy a ${nameOf(pack, 1)}: your balance is ${short} TK short of its ${taka(pack.price)} TK. ` +
        'Top up and buy one from your dashboard to keep going past the grace.',
    );
  }

  /** PLN-15: an email to the owner about a pack, never an SMS. */
  private async tell(tenantId: string, subject: string, body: string): Promise<void> {
    const contact = await this.staff.ownerContact(tenantId);
    if (!contact?.email) return;
    const email = contact.email;
    await this.tenants.runStandalone((tx) =>
      this.mail.queueLifecycleNotice(tx, email, subject, body),
    );
  }

  private billingOf(tenantId: string): Promise<BillingInfoRow | null> {
    return this.tenants.runStandalone((tx) => this.tenants.findBillingInfo(tx, tenantId));
  }
}
