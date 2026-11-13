import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { LedgerEntryType, RateKey } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { LedgerEntry } from '../types/ledger-entry';
import { BalanceService } from './balance.service';
import { RateService } from './rate.service';
import { fromPaisa, percentOf, rateToPaisa, toPaisa } from './money';

/**
 * PYG-02: an order's fee in paisa -- the greater of the minimum flat amount and a percentage of its grand total. The one rule:
 * charging uses it, and the daily reconciliation (DAT-52) works a charged fee out again from the figures its entry names.
 */
export function orderFeePaisa(orderTotal: string, minimum: string, percent: string): bigint {
  const minPaisa = rateToPaisa(minimum);
  const pctPaisa = percentOf(toPaisa(orderTotal), percent);
  return pctPaisa > minPaisa ? pctPaisa : minPaisa;
}

/** PYG-02, PYG-14: an order's fee as worked out, with the rates it was worked out on. */
export interface OrderFeeQuote {
  amount: string;
  minimum: string;
  percent: string;
}

/**
 * PYG-02/PYG-16: the pay-as-you-go order-fee and product-creation-fee charges. Built against the ledger
 * interface now (BalanceService.charge already has the OrderFee/ProductFee ledger types and overdraft-floor
 * guard, RateService already has the payg_* rate keys -- both seeded in slice 1); nothing in Phase 3/4 exists
 * yet to call these, so they're unwired until an order/product-creation flow lands to call them.
 *
 * Deliberately takes the caller's own transaction, never opens its own: PYG-04/PYG-18 require the charge to
 * be reversed automatically if the booking/creation itself subsequently fails, which only happens for free
 * if the charge is part of that same transaction, not a separate one committed on its own.
 *
 * A fee whose rate the operator set to nothing is no charge, so it writes no entry and returns null (BAL-02: an
 * entry is a balance change).
 */
@Injectable()
export class PayAsYouGoBillingService {
  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
  ) {}

  /**
   * PYG-02: the greater of a minimum flat amount and a percentage of the order's grand total. PYG-14: the entry names its
   * order, the total it was worked out on, and the rates applied.
   */
  async chargeOrderFee(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    orderTotal: string,
  ): Promise<LedgerEntry | null> {
    const quote = await this.quoteOrderFee(orderTotal);
    return quote === null ? null : this.chargeQuote(tx, tenantId, orderId, orderTotal, quote);
  }

  /**
   * PYG-03, D5-7's way, read agreed 2026-11-04: before a courier is called, the fee is worked out and the balance, less what is
   * already held, must cover it, or the booking is refused as a charge would be. The parcel holds it from here until it settles.
   * Null when the rates make it no charge.
   */
  async holdOrderFee(
    tx: Transaction,
    tenantId: string,
    orderTotal: string,
  ): Promise<OrderFeeQuote | null> {
    const quote = await this.quoteOrderFee(orderTotal);
    if (quote === null) return null;
    const held = await this.balance.heldWithin(tx, tenantId);
    if (held.frozen) throw new ApiError('tenant_offline', 'BalanceFrozen', {});
    if (toPaisa(held.amount) < toPaisa(quote.amount)) {
      throw new ApiError('quota_exceeded', 'InsufficientBalance', { balance: held.amount });
    }
    return quote;
  }

  /**
   * D5-7's way: the fee held for a booking, charged now the courier has accepted, at the rates it was held at. The parcel exists and
   * can't be refused, so a balance frozen or run down meanwhile charges nothing, as a held gateway fee does; null then.
   */
  async chargeHeldOrderFee(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    orderTotal: string,
    quote: OrderFeeQuote,
  ): Promise<LedgerEntry | null> {
    const held = await this.balance.heldWithin(tx, tenantId);
    if (held.frozen || toPaisa(held.amount) < toPaisa(quote.amount)) return null;
    return this.chargeQuote(tx, tenantId, orderId, orderTotal, quote);
  }

  /** PYG-02: the greater of the minimum and the percentage, on rates as they stand; null when that comes to nothing. */
  private async quoteOrderFee(orderTotal: string): Promise<OrderFeeQuote | null> {
    const [min, pct] = await Promise.all([
      this.rates.current(RateKey.PaygOrderFeeMin),
      this.rates.current(RateKey.PaygOrderFeePct),
    ]);
    if (!min || !pct) throw new Error('payg order fee rates are not seeded');

    const feePaisa = orderFeePaisa(orderTotal, min.value, pct.value);
    if (feePaisa === 0n) return null;
    return { amount: fromPaisa(feePaisa), minimum: min.value, percent: pct.value };
  }

  private chargeQuote(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    orderTotal: string,
    quote: OrderFeeQuote,
  ): Promise<LedgerEntry> {
    return this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.OrderFee,
      amount: quote.amount,
      reference: { orderId, orderTotal, minimum: quote.minimum, percent: quote.percent },
    });
  }

  /** PYG-16: a flat fee, once per product, regardless of how many variants it has. */
  async chargeProductCreationFee(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<LedgerEntry | null> {
    const fee = await this.rates.current(RateKey.PaygProductFee);
    if (!fee) throw new Error('payg product fee rate is not seeded');

    const feePaisa = rateToPaisa(fee.value);
    if (feePaisa === 0n) return null;

    return this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.ProductFee,
      amount: fromPaisa(feePaisa),
      reference: { productId },
    });
  }
}
