import { Inject, Injectable } from '@nestjs/common';
import type { BillingInfoRow } from '@lytronix/db';
import {
  ActorType,
  AddonKind,
  AuditAction,
  AuditResult,
  BRAND_IDENTITY_ADDON,
  BUYABLE_ADDON_KINDS,
  InvoiceKind,
  InvoiceLineKind,
  isUsageLimitKey,
  LedgerEntryType,
  limitOf,
  PlanPaymentKind,
  PlanPaymentStatus,
  TenantState,
  type PlanLimits,
  type QuoteAddonInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { dhakaDate, HOUR_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE, CLOCK } from '../tokens';
import type {
  ActiveAddon,
  AddonOffer,
  AddonPurchaseResult,
  AddonQuote,
  AddonRecord,
  ShopAddons,
} from '../types/addon';
import { addonPrice, type AddonPeriod } from './addon-price';
import { BillingTermsService } from './billing-terms.service';
import { ShopLimitsService } from './shop-limits.service';

// BIL-09: an add-on's quote is held for 30 minutes, as a plan's is.
const QUOTE_HOLD_MS = HOUR_MS / 2;

// PLN-14: the least an add-on costs, so a purchase on a period's last day still charges something.
const MIN_PRICE = 1;

/** The running period an add-on would be bought into, and the shop it belongs to. */
interface Buying {
  info: BillingInfoRow;
  period: AddonPeriod;
}

/** What decides whether an add-on can be bought: the shop's limits, its add-ons and its plan's features. */
interface Holdings {
  limits: PlanLimits | null;
  active: ActiveAddon[];
  features: Record<string, boolean> | null;
}

/** BRN-05, PLN-13: a feature add-on switches on the plan feature named by its key -- bought, or in the plan itself. */
function featureOn(key: string, holdings: Omit<Holdings, 'limits'>): boolean {
  return holdings.features?.[key] === true || holdings.active.some((addon) => addon.key === key);
}

/**
 * PLN-14: why `quantity` of this add-on cannot be bought now, or null when it can: a feature is one, and only while
 * the shop doesn't already have it; a limit add-on never raises a limit that is already unlimited (PLN-19).
 */
function refusalOf(addon: AddonRecord, quantity: number, holdings: Holdings): ApiError | null {
  if (addon.retiredAt || !BUYABLE_ADDON_KINDS.includes(addon.kind)) {
    return new ApiError('not_found', 'AddonNotFound', {});
  }
  if (addon.kind === AddonKind.Feature) {
    if (quantity !== 1) return new ApiError('validation_error', 'AddonOnlyOne', {});
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
 * PLN-13, PLN-14, BRN-05: buying add-ons. An add-on is bought into the shop's running paid period and ends with it,
 * priced for what is left of it; it is quoted like a plan (a held `plan_payments` row with a pending purchase) and
 * paid from the balance, at once. Paying by wallet, renewal and the pay-as-you-go and no-expiry periods follow in
 * Slice 10a.2; a trial or a lapsed shop buys none.
 */
@Injectable()
export class AddonPurchaseService {
  constructor(
    @Inject(ADDONS_STORE) private readonly store: AddonsStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(ShopLimitsService) private readonly shopLimits: ShopLimitsService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(AuditService) private readonly audit: AuditService,
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
    return catalogue
      .filter((addon) => BUYABLE_ADDON_KINDS.includes(addon.kind))
      .map((addon) => {
        const open = buying && holdings && refusalOf(addon, 1, holdings) === null;
        return {
          addon,
          price: open ? this.priceOf(addon, 1, buying.period, now) : null,
          expiresAt: open ? buying.period.end : null,
        };
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
   * now, its invoice (BIL-12) and the shop's activity entry, together or not at all.
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
      const purchase = await this.store.findPurchaseByPaymentForUpdate(tx, payment.id);
      const addon = purchase && (await this.store.findById(tx, purchase.addonId));
      if (!purchase || !addon) throw new Error('an add-on payment has no purchase');

      // The period it was priced for must still be the one running: a plan change since then needs a new quote.
      const info = await this.tenants.findBillingInfo(tx, tenantId);
      if (
        info?.state !== TenantState.Active ||
        info.periodEnd?.getTime() !== purchase.expiresAt.getTime()
      ) {
        throw new ApiError('conflict', 'QuoteExpired', {});
      }
      // Two quotes for one feature: only the first paid switches it on.
      if (
        addon.kind === AddonKind.Feature &&
        featureOn(addon.key, {
          active: await this.store.listActive(tx, tenantId),
          features: info.featureSnapshot,
        })
      ) {
        throw new ApiError('conflict', 'AddonAlreadyActive', {});
      }

      await this.balance.charge(tx, {
        tenantId,
        type: LedgerEntryType.Addon,
        amount: payment.amount,
        reference: { planPaymentId: payment.id, addonPurchaseId: purchase.id },
      });
      await this.payments.markVerifiedDirect(tx, payment.id, now);
      await this.store.activatePurchase(tx, purchase.id, now);

      const owner = await this.staff.ownerContactIn(tx, tenantId);
      const invoice = await this.invoices.issue(
        tx,
        {
          tenantId,
          kind: InvoiceKind.Addon,
          planSnapshot: null,
          amount: payment.amount,
          creditAmount: '0',
          billingTermLabel: null,
          shopName: info.shopName,
          ownerName: owner?.name ?? null,
          planName: null,
          planVersion: null,
          periodStart: now,
          periodEnd: purchase.expiresAt,
          discountAmount: '0',
          paymentMethod: 'balance',
          paymentReference: null,
        },
        [
          {
            kind: InvoiceLineKind.Addon,
            description: `${addon.labelEn}, until ${dhakaDate(purchase.expiresAt)}`,
            quantity: purchase.quantity,
            amount: payment.amount,
          },
        ],
      );

      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
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
          expiresAt: purchase.expiresAt,
          invoiceNumber: invoice.number,
        },
      });
      return {
        payment: { ...payment, status: PlanPaymentStatus.Verified, verifiedAt: now },
        invoice,
      };
    });
    // The storefront's cached shop carries its limits; the new one applies from the next request.
    this.tenantCache.invalidateTenant(tenantId);
    return result;
  }

  /** PLN-14, BRN-05: the add-ons the shop has now, and whether its brand identity may be switched on. */
  async mine(tenantId: string): Promise<ShopAddons> {
    const [addons, info] = await Promise.all([
      this.store.run((tx) => this.store.listActive(tx, tenantId)),
      this.tenants.runStandalone((tx) => this.tenants.findBillingInfo(tx, tenantId)),
    ]);
    return {
      addons,
      brandIdentity: featureOn(BRAND_IDENTITY_ADDON, {
        active: addons,
        features: info?.featureSnapshot ?? null,
      }),
    };
  }

  /** PLN-14: the shop's running paid period, or null when it can buy no add-on now. */
  private async buyingOf(tenantId: string, now: Date): Promise<Buying | null> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (
      info?.state !== TenantState.Active ||
      !info.periodStart ||
      !info.periodEnd ||
      info.periodEnd <= now
    ) {
      return null;
    }
    const months = info.billingTermId
      ? (await this.terms.findById(info.billingTermId)).months
      : null;
    return { info, period: { start: info.periodStart, end: info.periodEnd, months } };
  }

  private async holdingsOf(tenantId: string, info: BillingInfoRow): Promise<Holdings> {
    const [limits, active] = await Promise.all([
      this.shopLimits.of(tenantId, info.planSnapshot),
      this.store.run((tx) => this.store.listActive(tx, tenantId)),
    ]);
    return { limits, active, features: info.featureSnapshot };
  }

  private priceOf(addon: AddonRecord, quantity: number, period: AddonPeriod, now: Date): number {
    return Math.max(addonPrice(addon.price, quantity, period, now), MIN_PRICE);
  }
}
