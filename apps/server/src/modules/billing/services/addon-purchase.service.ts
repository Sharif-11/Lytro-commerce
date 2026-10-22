import { Inject, Injectable } from '@nestjs/common';
import type { BillingInfoRow, Transaction } from '@lytronix/db';
import {
  ActorType,
  ADDON_WARNING_DAYS,
  AddonKind,
  AddonPurchaseStatus,
  AddonRenewal,
  AuditAction,
  AuditResult,
  BRAND_IDENTITY_ADDON,
  BUYABLE_ADDON_KINDS,
  InvoiceKind,
  isUsageLimitKey,
  LedgerEntryType,
  limitOf,
  PlanPaymentKind,
  PlanPaymentStatus,
  type PlanLimits,
  type QuoteAddonInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { MessageKey } from '../../../common/i18n/message-key';
import { DAY_MS, HOUR_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE, CLOCK } from '../tokens';
import type {
  ActiveAddon,
  AddonOffer,
  AddonPurchaseRecord,
  AddonPurchaseResult,
  AddonQuote,
  AddonRecord,
  RenewingAddon,
  ShopAddons,
} from '../types/addon';
import { canTake, periodEndFor } from './addon-eligibility';
import { AddonPackService } from './addon-pack.service';
import { addonPrice, type AddonPeriod } from './addon-price';
import { AddonRenewalService, NOT_RENEWING, type OwnPeriod } from './addon-renewal.service';
import { BillingTermsService } from './billing-terms.service';
import { addonLine } from './plan-invoicing.service';
import { ShopLimitsService } from './shop-limits.service';

// BIL-09: an add-on's quote is held for 30 minutes, as a plan's is.
const QUOTE_HOLD_MS = HOUR_MS / 2;

// PLN-14: the least an add-on costs, so a purchase on a period's last day still charges something.
const MIN_PRICE = 1;

// PLN-14: what the owner is told when an approved wallet payment could not add its add-on, by why it could not.
const NOT_TAKEN: Partial<Record<MessageKey, string>> = {
  AddonNotAvailable: "your shop's plan was no longer active",
  AddonAlreadyActive: 'your shop already had it',
  AddonLimitUnlimited: 'your plan no longer limits what it adds',
};

/** The running period an add-on would be bought into, and the shop it belongs to. */
interface Buying {
  info: BillingInfoRow;
  period: AddonPeriod;
}

/** What decides whether an add-on can be taken: the shop's limits, its add-ons and its plan's features. */
interface Holdings {
  limits: PlanLimits | null;
  active: ActiveAddon[];
  features: Record<string, boolean> | null;
}

/** A quoted add-on payment's purchase, its item, and the shop as it stands at payment. */
interface Paying {
  purchase: AddonPurchaseRecord;
  addon: AddonRecord;
  info: BillingInfoRow | null;
}

/** BRN-05, PLN-13: a feature add-on switches on the plan feature named by its key -- bought, or in the plan itself. */
function featureOn(key: string, holdings: Omit<Holdings, 'limits'>): boolean {
  return holdings.features?.[key] === true || holdings.active.some((addon) => addon.key === key);
}

/**
 * PLN-14: why the shop cannot take this add-on, whatever the catalogue now says of it: a feature it already has, or a
 * limit that is already unlimited (PLN-19). Null when it can.
 */
function takeRefusal(addon: AddonRecord, holdings: Holdings): ApiError | null {
  if (addon.kind === AddonKind.Feature) {
    return featureOn(addon.key, holdings)
      ? new ApiError('conflict', 'AddonAlreadyActive', {})
      : null;
  }
  if (
    addon.limitKey === null ||
    !isUsageLimitKey(addon.limitKey) ||
    limitOf(holdings.limits, addon.limitKey) === null
  ) {
    return new ApiError('conflict', 'AddonLimitUnlimited', {});
  }
  return null;
}

/**
 * PLN-14: why `quantity` of this add-on cannot be bought now, or null when it can: an item no longer for sale, more than
 * one of a feature, or one the shop cannot take.
 */
function refusalOf(addon: AddonRecord, quantity: number, holdings: Holdings): ApiError | null {
  if (addon.retiredAt || !BUYABLE_ADDON_KINDS.includes(addon.kind)) {
    return new ApiError('not_found', 'AddonNotFound', {});
  }
  if (addon.kind === AddonKind.Feature && quantity !== 1) {
    return new ApiError('validation_error', 'AddonOnlyOne', {});
  }
  return takeRefusal(addon, holdings);
}

/**
 * PLN-13, PLN-14, BRN-05: buying add-ons. An add-on is bought into the shop's running paid period and ends with it,
 * priced for what is left of it; it is quoted like a plan (a held `plan_payments` row with a pending purchase) and
 * paid from the balance at once, or by wallet, activated when an operator approves the payment (BIL-02). The
 * pay-as-you-go and no-expiry periods follow in Slice 10a.2's second part; a trial or a lapsed shop buys none.
 */
@Injectable()
export class AddonPurchaseService {
  constructor(
    @Inject(ADDONS_STORE) private readonly store: AddonsStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(ShopLimitsService) private readonly shopLimits: ShopLimitsService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(AddonPackService) private readonly packs: AddonPackService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MessagingService) private readonly sms: MessagingService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(TenantCache) private readonly tenantCache: TenantCache,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * PLN-13, PLN-14: every add-on for sale, with what one costs for the rest of the period -- or no price where the
   * shop can't buy it now (no running paid period, an unlimited limit, a feature it already has).
   */
  async offers(tenantId: string): Promise<AddonOffer[]> {
    const now = this.clock();
    const [catalogue, buying] = await Promise.all([
      this.store.run((tx) => this.store.list(tx, false)),
      this.buyingOf(tenantId, now),
    ]);
    const holdings = buying ? await this.holdingsOf(tenantId, buying.info) : null;
    return catalogue.flatMap((addon) => {
      // PLN-15: a pack's price is fixed and it has no end; it is bought by `POST /addons/packs`.
      if (addon.kind === AddonKind.Pack) {
        return [{ addon, price: buying ? Number(addon.price) : null, expiresAt: null }];
      }
      if (!BUYABLE_ADDON_KINDS.includes(addon.kind)) return [];
      const open = buying && holdings && refusalOf(addon, 1, holdings) === null;
      return [
        {
          addon,
          price: open ? this.priceOf(addon, 1, buying.period, now) : null,
          expiresAt: open ? buying.period.end : null,
        },
      ];
    });
  }

  /** PLN-14, BIL-09: prices the add-on to the period's end and holds the price for 30 minutes. */
  async quote(tenantId: string, input: QuoteAddonInput): Promise<AddonQuote> {
    const now = this.clock();
    const buying = await this.buyingOf(tenantId, now);
    if (!buying) throw new ApiError('plan_feature_unavailable', 'AddonNotAvailable', {});
    const addon = await this.store.run((tx) => this.store.findById(tx, input.addonId));
    if (!addon) throw new ApiError('not_found', 'AddonNotFound', {});
    const refusal = refusalOf(addon, input.quantity, await this.holdingsOf(tenantId, buying.info));
    if (refusal) throw refusal;

    const amount = this.priceOf(addon, input.quantity, buying.period, now).toFixed(2);
    return this.store.run(async (tx) => {
      const payment = await this.payments.quote(tx, {
        tenantId,
        kind: PlanPaymentKind.Addon,
        planId: null,
        billingTermId: null,
        amount,
        creditAmount: '0',
      });
      // It keeps what the catalogue says now, so a later edit never changes what was bought (PLN-13).
      await this.store.insertPurchase(tx, {
        tenantId,
        addonId: addon.id,
        kind: addon.kind,
        limitKey: addon.limitKey,
        unitSize: addon.unitSize,
        quantity: input.quantity,
        price: amount,
        paidFrom: 'balance',
        planPaymentId: payment.id,
        expiresAt: buying.period.end,
      });
      return { payment, addon, quantity: input.quantity, expiresAt: buying.period.end };
    });
  }

  /**
   * PLN-14, BIL-08: pays a quoted add-on from the balance -- atomic and instant: the charge, the add-on counting from
   * now, its invoice (BIL-12) and the shop's activity entry, together or not at all. Nothing is charged for an add-on
   * the shop can no longer take.
   */
  async confirmFromBalance(
    paymentId: string,
    tenantId: string,
    ip?: string | null,
  ): Promise<AddonPurchaseResult> {
    const now = this.clock();
    const result = await this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.findForUpdate(tx, paymentId);
      if (!payment || payment.tenantId !== tenantId || payment.kind !== PlanPaymentKind.Addon) {
        throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      }
      if (payment.status !== PlanPaymentStatus.Pending) {
        throw new ApiError('conflict', 'PlanPaymentNotPending', {});
      }
      if (now.getTime() - payment.quotedAt.getTime() > QUOTE_HOLD_MS) {
        throw new ApiError('conflict', 'QuoteExpired', {});
      }
      const refusal = await this.refusalAt(await this.payingOf(tx, payment), now);
      if (refusal) throw refusal;

      await this.balance.charge(tx, {
        tenantId,
        type: LedgerEntryType.Addon,
        amount: payment.amount,
        reference: { planPaymentId: payment.id },
      });
      await this.payments.markVerifiedDirect(tx, payment.id, now);
      return {
        payment: { ...payment, status: PlanPaymentStatus.Verified, verifiedAt: now },
        invoice: await this.activate(tx, payment, now, ip),
      };
    });
    // The storefront's cached shop carries its limits; the new one applies from the next request.
    this.tenantCache.invalidateTenant(tenantId);
    return result;
  }

  /** BIL-02: the tenant's "I have paid" wallet submission -- enters the operator's queue; nothing activates yet. */
  submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
  ): Promise<PlanPaymentRecord> {
    return this.payments.submitWalletPayment(paymentId, tenantId, input, [PlanPaymentKind.Addon]);
  }

  /**
   * PLN-14: a paid add-on takes effect, in the payment's transaction -- from the balance, or approved from the queue
   * (D2-1). It runs into the paid period running now, never shorter than quoted and never re-priced. When the shop can
   * take no add-on any more -- its period ended, the limit became unlimited, the feature is already on -- the money
   * already paid goes to its balance instead, the owner is told, and there is no invoice: null.
   */
  async activate(
    tx: Transaction,
    payment: PlanPaymentRecord,
    now: Date,
    ip?: string | null,
    actorType: ActorType = ActorType.User,
  ): Promise<InvoiceRecord | null> {
    const paying = await this.payingOf(tx, payment);
    const refusal = await this.refusalAt(paying, now);
    const { purchase, addon, info } = paying;
    if (refusal || !info) {
      await this.creditInstead(tx, payment, paying, refusal, ip);
      return null;
    }
    // A renewal for another period keeps its own window; a fresh purchase runs from now to the shop's period end, or
    // its own 30 days, never shorter than quoted.
    const startsAt = purchase.startsAt ?? now;
    const runsTo = purchase.startsAt ? purchase.expiresAt : periodEndFor(info, now);
    const expiresAt = runsTo > purchase.expiresAt ? runsTo : purchase.expiresAt;
    const paidByWallet = payment.transactionId !== null;
    await this.store.activatePurchase(tx, purchase.id, {
      startsAt,
      expiresAt,
      paidFrom: paidByWallet ? 'wallet' : 'balance',
    });

    const owner = await this.staff.ownerContactIn(tx, payment.tenantId);
    const invoice = await this.invoices.issue(
      tx,
      {
        tenantId: payment.tenantId,
        kind: InvoiceKind.Addon,
        planSnapshot: null,
        amount: payment.amount,
        creditAmount: '0',
        billingTermLabel: null,
        shopName: info.shopName,
        ownerName: owner?.name ?? null,
        planName: null,
        planVersion: null,
        periodStart: startsAt,
        periodEnd: expiresAt,
        discountAmount: '0',
        paymentMethod: paidByWallet ? 'wallet' : 'balance',
        paymentReference: payment.transactionId,
      },
      [addonLine(addon.labelEn, purchase.quantity, payment.amount, expiresAt)],
    );

    await this.audit.record(tx, {
      tenantId: payment.tenantId,
      actorType,
      actorId: null,
      action: AuditAction.AddonPurchased,
      ip: ip ?? null,
      targetType: 'addon_purchase',
      targetId: purchase.id,
      result: AuditResult.Success,
      summary: {
        key: addon.key,
        quantity: purchase.quantity,
        amount: payment.amount,
        expiresAt,
        invoiceNumber: invoice.number,
      },
    });
    return invoice;
  }

  /**
   * PLN-14, BRN-05: the add-ons the shop has now, how each will renew and whether it ends within the warning days without
   * renewing (the dashboard's banner), and whether its brand identity may be on.
   */
  async mine(tenantId: string): Promise<ShopAddons> {
    const now = this.clock();
    const [addons, info] = await Promise.all([
      this.store.run((tx) => this.store.listActive(tx, tenantId)),
      this.tenants.runStandalone((tx) => this.tenants.findBillingInfo(tx, tenantId)),
    ]);
    const outlook = await this.renewals.outlook(
      tenantId,
      info,
      addons.map((addon) => ({ ...addon, price: addon.monthlyPrice })),
      now,
    );
    const warnFrom = Math.max(...ADDON_WARNING_DAYS) * DAY_MS;
    return {
      addons: addons.map((addon) => {
        const renewal = outlook.get(addon.id) ?? AddonRenewal.WithPlan;
        const endsIn = addon.expiresAt.getTime() - now.getTime();
        return { ...addon, renewal, endsSoon: NOT_RENEWING.has(renewal) && endsIn <= warnFrom };
      }),
      brandIdentity: featureOn(BRAND_IDENTITY_ADDON, {
        active: addons,
        features: info?.featureSnapshot ?? null,
      }),
      packs: await this.packs.packsOf(tenantId),
    };
  }

  /**
   * PLN-14: an add-on that does not renew with the plan, renewed from the balance for its next period (the lifecycle
   * tick): its own payment, charge and invoice, continuing the add-on it renews. Throws when the balance is short
   * (`quota_exceeded`), and nothing is kept.
   */
  async renewFromBalance(from: RenewingAddon, next: OwnPeriod, now: Date): Promise<void> {
    const tenantId = from.tenantId;
    await this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.quote(tx, {
        tenantId,
        kind: PlanPaymentKind.Addon,
        planId: null,
        billingTermId: null,
        amount: next.price,
        creditAmount: '0',
      });
      await this.store.insertPurchase(tx, {
        tenantId,
        addonId: from.addonId,
        kind: from.kind,
        limitKey: from.limitKey,
        unitSize: from.unitSize,
        quantity: from.quantity,
        price: next.price,
        paidFrom: 'balance',
        planPaymentId: payment.id,
        startsAt: next.start,
        expiresAt: next.end,
        continuesId: from.id,
      });
      await this.balance.charge(tx, {
        tenantId,
        type: LedgerEntryType.Addon,
        amount: next.price,
        reference: { planPaymentId: payment.id },
      });
      await this.payments.markVerifiedDirect(tx, payment.id, now);
      await this.activate(tx, payment, now, null, ActorType.System);
    });
  }

  /** PLN-14: the owner switches one add-on's renewal on or off, until it ends. The add-ons as they now stand. */
  async setRenewal(
    tenantId: string,
    purchaseId: string,
    renews: boolean,
    ip?: string | null,
  ): Promise<ShopAddons> {
    const now = this.clock();
    await this.tenants.runStandalone(async (tx) => {
      const purchase = await this.store.findPurchaseForTenantForUpdate(tx, tenantId, purchaseId);
      if (
        !purchase ||
        purchase.status === AddonPurchaseStatus.Pending ||
        purchase.status === AddonPurchaseStatus.Cancelled
      ) {
        throw new ApiError('not_found', 'AddonNotFound', {});
      }
      if (purchase.status === AddonPurchaseStatus.Lapsed || purchase.expiresAt <= now) {
        throw new ApiError('conflict', 'AddonEnded', {});
      }
      if (purchase.renews === renews) return;
      await this.store.setRenews(tx, purchase.id, renews);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.AddonRenewalSet,
        ip: ip ?? null,
        targetType: 'addon_purchase',
        targetId: purchase.id,
        result: AuditResult.Success,
        summary: { renews },
      });
    });
    return this.mine(tenantId);
  }

  /** PLN-14: the shop's running paid period, or null when it can buy no add-on now. */
  private async buyingOf(tenantId: string, now: Date): Promise<Buying | null> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!canTake(info, now)) return null;
    if (info.periodStart && info.periodEnd) {
      const months = info.billingTermId
        ? (await this.terms.findById(info.billingTermId)).months
        : null;
      return { info, period: { start: info.periodStart, end: info.periodEnd, months } };
    }
    // PLN-14: nothing to align with -- the add-on runs its own 30 days, at the full monthly price.
    return { info, period: { start: now, end: periodEndFor(info, now), months: 1 } };
  }

  private async holdingsOf(tenantId: string, info: BillingInfoRow): Promise<Holdings> {
    const [limits, active] = await Promise.all([
      this.shopLimits.of(tenantId, info.planSnapshot),
      this.store.run((tx) => this.store.listActive(tx, tenantId)),
    ]);
    return { limits, active, features: info.featureSnapshot };
  }

  /** The purchase a quoted add-on payment pays for, locked, with its item and the shop as it stands now. */
  private async payingOf(tx: Transaction, payment: PlanPaymentRecord): Promise<Paying> {
    const purchase = await this.store.findPurchaseByPaymentForUpdate(tx, payment.id);
    const addon = purchase && (await this.store.findById(tx, purchase.addonId));
    if (!purchase || !addon) throw new Error('an add-on payment has no purchase');
    return { purchase, addon, info: await this.tenants.findBillingInfo(tx, payment.tenantId) };
  }

  /**
   * PLN-14: why the shop cannot take a paid add-on now -- no running paid period, or nothing left for it to raise or
   * switch on. A paid add-on whose item has since been retired is still taken: what was bought runs (PLN-13).
   */
  private async refusalAt(paying: Paying, now: Date): Promise<ApiError | null> {
    if (!canTake(paying.info, now)) {
      return new ApiError('plan_feature_unavailable', 'AddonNotAvailable', {});
    }
    return takeRefusal(paying.addon, await this.holdingsOf(paying.purchase.tenantId, paying.info));
  }

  /**
   * PLN-14: an approved wallet payment the shop can no longer use: the purchase is cancelled and the amount credited to
   * its balance as a top-up, with no refund (BAL-01) -- and the owner is told why, by SMS and email, as a confirmed
   * payment is (BIL-05).
   */
  private async creditInstead(
    tx: Transaction,
    payment: PlanPaymentRecord,
    { purchase, addon }: Paying,
    refusal: ApiError | null,
    ip?: string | null,
  ): Promise<void> {
    const tenantId = payment.tenantId;
    await this.store.cancelPurchase(tx, purchase.id);
    await this.balance.credit(tx, {
      tenantId,
      type: LedgerEntryType.TopUp,
      amount: payment.amount,
      reference: { planPaymentId: payment.id },
    });
    await this.audit.record(tx, {
      tenantId,
      actorType: ActorType.User,
      actorId: null,
      action: AuditAction.BalanceToppedUp,
      ip: ip ?? null,
      targetType: 'plan_payment',
      targetId: payment.id,
      result: AuditResult.Success,
      summary: { amount: payment.amount, addon: addon.key, notTaken: refusal?.messageKey ?? null },
    });
    const why =
      (refusal && NOT_TAKEN[refusal.messageKey]) ?? "your shop's plan was no longer active";
    const body =
      `Your payment of ${payment.amount} TK for ${addon.labelEn} could not add it, because ${why}. ` +
      `The ${payment.amount} TK has been added to your balance instead.`;
    const owner = await this.staff.ownerContactIn(tx, tenantId);
    if (owner?.phone) await this.sms.queueLifecycleNotice(tx, owner.phone, body);
    if (owner?.email) {
      await this.mail.queueLifecycleNotice(
        tx,
        owner.email,
        'Your add-on payment went to your balance',
        body,
      );
    }
  }

  private priceOf(addon: AddonRecord, quantity: number, period: AddonPeriod, now: Date): number {
    return Math.max(addonPrice(addon.price, quantity, period, now), MIN_PRICE);
  }
}
