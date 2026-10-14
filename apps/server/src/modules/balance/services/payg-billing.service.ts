import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { LedgerEntryType, RateKey } from '@lytronix/validators';
import type { LedgerEntry } from '../types/ledger-entry';
import { BalanceService } from './balance.service';
import { RateService } from './rate.service';
import { fromPaisa, toPaisa } from './money';

/**
 * PYG-02/PYG-16: the pay-as-you-go order-fee and product-creation-fee charges. Built against the ledger
 * interface now (BalanceService.charge already has the OrderFee/ProductFee ledger types and overdraft-floor
 * guard, RateService already has the payg_* rate keys -- both seeded in slice 1); nothing in Phase 3/4 exists
 * yet to call these, so they're unwired until an order/product-creation flow lands to call them.
 *
 * Deliberately takes the caller's own transaction, never opens its own: PYG-04/PYG-18 require the charge to
 * be reversed automatically if the booking/creation itself subsequently fails, which only happens for free
 * if the charge is part of that same transaction, not a separate one committed on its own.
 */
@Injectable()
export class PayAsYouGoBillingService {
  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
  ) {}

  /** PYG-02: the greater of a minimum flat amount and a percentage of the order's grand total. */
  async chargeOrderFee(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    orderTotal: string,
  ): Promise<LedgerEntry> {
    const [min, pct] = await Promise.all([
      this.rates.current(RateKey.PaygOrderFeeMin),
      this.rates.current(RateKey.PaygOrderFeePct),
    ]);
    if (!min || !pct) throw new Error('payg order fee rates are not seeded');

    const totalPaisa = toPaisa(orderTotal);
    // Rates are numeric(12,4) -- up to 4 decimal places -- while toPaisa() only accepts money's own 2, so
    // rate values are rounded to paisa directly here instead of going through toPaisa().
    const minPaisa = BigInt(Math.round(Number(min.value) * 100));
    const pctPaisa = BigInt(Math.round((Number(totalPaisa) * Number(pct.value)) / 100));
    const feePaisa = pctPaisa > minPaisa ? pctPaisa : minPaisa;

    return this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.OrderFee,
      amount: fromPaisa(feePaisa),
      reference: { orderId },
    });
  }

  /** PYG-16: a flat fee, once per product, regardless of how many variants it has. */
  async chargeProductCreationFee(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<LedgerEntry> {
    const fee = await this.rates.current(RateKey.PaygProductFee);
    if (!fee) throw new Error('payg product fee rate is not seeded');

    const feePaisa = BigInt(Math.round(Number(fee.value) * 100));

    return this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.ProductFee,
      amount: fromPaisa(feePaisa),
      reference: { productId },
    });
  }
}
