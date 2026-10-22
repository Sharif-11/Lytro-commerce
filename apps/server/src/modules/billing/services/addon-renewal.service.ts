import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AddonKind,
  AddonPurchaseStatus,
  AddonRenewal,
  AuditAction,
  AuditResult,
  isUsageLimitKey,
  LedgerEntryType,
  limitOf,
  type PlanLimits,
} from '@lytronix/validators';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { MailService } from '../../shared/mail/services/mail.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE } from '../tokens';
import type { AddonCarry, PaymentAddon, RenewingAddon } from '../types/addon';
import { addonPrice, type AddonPeriod } from './addon-price';
import { ShopLimitsService } from './shop-limits.service';

/** The plan a renewal or an upgrade lands the shop on, as the add-ons it carries are judged against it. */
export interface CarryPlan {
  limits: PlanLimits | null;
  features: Record<string, boolean>;
}

/** What auto-renew could afford: the add-ons it carries, and the ones the balance did not reach. */
export interface BudgetedCarries {
  kept: AddonCarry[];
  dropped: AddonCarry[];
}

/**
 * PLN-14, PLN-19, BRN-05: why an add-on would not renew onto this plan -- its item is retired, or the plan leaves it
 * nothing to raise (an unlimited limit) or to switch on (a feature the plan includes) -- or null when it would.
 */
export function renewalBar(
  addon: { kind: AddonKind; key: string; limitKey: string | null; retiredAt: Date | null },
  plan: CarryPlan,
): AddonRenewal.Retired | AddonRenewal.Unlimited | null {
  if (addon.retiredAt) return AddonRenewal.Retired;
  const raises =
    addon.kind === AddonKind.Feature
      ? plan.features[addon.key] !== true
      : addon.limitKey !== null &&
        isUsageLimitKey(addon.limitKey) &&
        limitOf(plan.limits, addon.limitKey) !== null;
  return raises ? null : AddonRenewal.Unlimited;
}

/** The paisa these add-ons cost together. */
export function addonsTotal(addons: readonly { price: string }[]): bigint {
  return addons.reduce((sum, addon) => sum + toPaisa(addon.price), 0n);
}

/**
 * PLN-14, BIL-17: auto-renew carries add-ons oldest first for as long as the balance left after the plan reaches;
 * the first one it does not reach, and every one after it, is left to end with its period.
 */
export function withinBudget(carries: readonly AddonCarry[], budget: bigint): BudgetedCarries {
  let spent = 0n;
  const reached = carries.findIndex((carry) => {
    spent += toPaisa(carry.price);
    return spent > budget;
  });
  return reached === -1
    ? { kept: [...carries], dropped: [] }
    : { kept: carries.slice(0, reached), dropped: carries.slice(reached) };
}

/**
 * PLN-14, UPG-14: add-ons carried from one period into the next -- renewed in the plan's renewal payment, or extended
 * to a new period's end by an upgrade -- as pending purchases on that payment, taking effect with it. Never a retired
 * item, a limit the plan makes unlimited, or a feature the plan already includes (PLN-19, BRN-05).
 */
@Injectable()
export class AddonRenewalService {
  constructor(
    @Inject(ADDONS_STORE) private readonly store: AddonsStore,
    @Inject(ShopLimitsService) private readonly shopLimits: ShopLimitsService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * PLN-14: what renewing the period ending at `periodEnd` carries -- every add-on of it set to renew, at the
   * catalogue's price now times its quantity times the term's months.
   */
  async renewals(
    tenantId: string,
    periodEnd: Date,
    months: number,
    plan: CarryPlan,
  ): Promise<AddonCarry[]> {
    return (await this.carried(tenantId, periodEnd, plan)).map((from) => ({
      from,
      price: fromPaisa(toPaisa(from.price) * BigInt(from.quantity * months)),
    }));
  }

  /**
   * UPG-14: what an upgrade carries -- every add-on of the current period set to renew, extended from its own end to
   * the new period's end at the new term's rate (PLN-14's proration). An add-on with its renewal off keeps its end.
   */
  async extensions(
    tenantId: string,
    periodEnd: Date,
    period: AddonPeriod,
    plan: CarryPlan,
  ): Promise<AddonCarry[]> {
    return (await this.carried(tenantId, periodEnd, plan)).flatMap((from) => {
      if (from.expiresAt >= period.end) return [];
      const price = addonPrice(from.price, from.quantity, period, from.expiresAt);
      return price > 0 ? [{ from, price: price.toFixed(2) }] : [];
    });
  }

  /**
   * DWN-03, PLN-14: what the add-ons set to renew would add to this plan's limits, renewed with it -- for judging the
   * plan before the period ends.
   */
  async renewingUnits(
    tenantId: string,
    periodEnd: Date,
    plan: CarryPlan,
  ): Promise<{ limitKey: string; units: number }[]> {
    return (await this.carried(tenantId, periodEnd, plan)).flatMap(
      ({ kind, limitKey, unitSize, quantity }) =>
        kind === AddonKind.Limit && limitKey !== null && unitSize !== null
          ? [{ limitKey, units: quantity * unitSize }]
          : [],
    );
  }

  /**
   * Adds the carried add-ons to a quoted payment, pending until it is paid. An extension starts where the add-on it
   * extends ends; a renewal starts with the period its payment lands in, written when it is paid.
   */
  async attach(
    tx: Transaction,
    payment: PlanPaymentRecord,
    carries: readonly AddonCarry[],
    ends: { expiresAt: Date; extending: boolean },
  ): Promise<void> {
    for (const { from, price } of carries) {
      await this.store.insertPurchase(tx, {
        tenantId: payment.tenantId,
        addonId: from.addonId,
        kind: from.kind,
        limitKey: from.limitKey,
        unitSize: from.unitSize,
        quantity: from.quantity,
        price,
        paidFrom: 'balance',
        planPaymentId: payment.id,
        startsAt: ends.extending ? from.expiresAt : null,
        expiresAt: ends.expiresAt,
        purchasedAt: from.purchasedAt,
      });
    }
  }

  /** The add-ons a payment still has to activate. */
  async pendingFor(tx: Transaction, paymentId: string): Promise<PaymentAddon[]> {
    return (await this.store.listForPayments(tx, [paymentId])).filter(
      (addon) => addon.status === AddonPurchaseStatus.Pending,
    );
  }

  /** ADM-06: the add-ons each of these payments pays for, by payment. */
  async forPayments(paymentIds: string[]): Promise<Map<string, PaymentAddon[]>> {
    const rows = await this.store.run((tx) => this.store.listForPayments(tx, paymentIds));
    const byPayment = new Map<string, PaymentAddon[]>();
    for (const row of rows) {
      byPayment.set(row.planPaymentId, [...(byPayment.get(row.planPaymentId) ?? []), row]);
    }
    return byPayment;
  }

  /**
   * PLN-14: a paid payment's add-ons take effect with its plan period, until that period's end -- a renewal's from the
   * period's start, an extension from where the add-on it extends ends. The ones it activated, for the invoice.
   */
  async activate(
    tx: Transaction,
    payment: PlanPaymentRecord,
    period: { start: Date; end: Date },
  ): Promise<PaymentAddon[]> {
    const pending = await this.pendingFor(tx, payment.id);
    for (const addon of pending) {
      await this.store.activatePurchase(tx, addon.id, {
        startsAt: addon.startsAt ?? period.start,
        expiresAt: period.end,
        paidFrom: payment.transactionId === null ? 'balance' : 'wallet',
      });
    }
    return pending;
  }

  /**
   * BIL-08, PLN-14: a plan payment from the balance, charged as two ledger entries in one transaction -- the plan, and
   * the add-ons it carries -- so the statement says what each part paid for.
   */
  async charge(tx: Transaction, payment: PlanPaymentRecord): Promise<void> {
    const addons = addonsTotal(await this.pendingFor(tx, payment.id));
    const reference = { planPaymentId: payment.id };
    await this.balance.charge(tx, {
      tenantId: payment.tenantId,
      type: LedgerEntryType.PlanPayment,
      amount: fromPaisa(toPaisa(payment.amount) - addons),
      reference,
    });
    if (addons > 0n) {
      await this.balance.charge(tx, {
        tenantId: payment.tenantId,
        type: LedgerEntryType.Addon,
        amount: fromPaisa(addons),
        reference,
      });
    }
  }

  /**
   * PLN-14, BIL-17: auto-renew renewed the plan but its balance did not reach these add-ons, which ended with the period.
   * The owner is told by email how much the balance was short, and the shop's log says which were left.
   */
  async tellNotRenewed(
    tenantId: string,
    dropped: readonly AddonCarry[],
    short: bigint,
  ): Promise<void> {
    const contact = await this.staff.ownerContact(tenantId);
    const names = dropped
      .map(({ from }) =>
        from.quantity === 1 ? from.labelEn : `${from.labelEn} x${String(from.quantity)}`,
      )
      .join(', ');
    const body =
      `Your plan renewed from your balance, but these add-ons did not: ${names}. Your balance was ` +
      `${fromPaisa(short)} TK short of renewing them too. They ended with your last period; you can buy them again ` +
      'from the add-ons page.';
    await this.tenants.runStandalone(async (tx) => {
      if (contact?.email) {
        await this.mail.queueLifecycleNotice(tx, contact.email, 'Some add-ons did not renew', body);
      }
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.AddonNotRenewed,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: {
          addons: dropped.map(({ from, price }) => ({
            key: from.key,
            quantity: from.quantity,
            price,
          })),
          short: fromPaisa(short),
        },
      });
    });
  }

  /** The plan's limits with the shop's overrides and its features, as a carried add-on is judged against them. */
  async planFor(
    tenantId: string,
    plan: { limits: PlanLimits | null; features: Record<string, boolean> },
  ): Promise<CarryPlan> {
    return { limits: await this.shopLimits.planOf(tenantId, plan.limits), features: plan.features };
  }

  /** The add-ons set to renew that end at `periodEnd` and that the plan still leaves something to raise or switch on. */
  private async carried(
    tenantId: string,
    periodEnd: Date,
    plan: CarryPlan,
  ): Promise<RenewingAddon[]> {
    const rows = await this.store.run((tx) => this.store.listRenewing(tx, tenantId, periodEnd));
    return rows.filter((row) => renewalBar(row, plan) === null);
  }
}
