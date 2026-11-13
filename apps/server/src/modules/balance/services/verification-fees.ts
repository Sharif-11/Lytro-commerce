import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { LedgerEntryType, RateKey } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import { Leases } from '../../shared/limits/services/leases';
import type { LowBalanceNotifier } from '../ports/low-balance-notifier';
import { LOW_BALANCE_NOTIFIER } from '../tokens';
import { BalanceService } from './balance.service';
import { fromPaisa, percentOf, toPaisa } from './money';
import { RateService } from './rate.service';

/** What the fee did: charged, nothing to charge (it rounds to nothing, BAL-16), or a balance too short to pay it. */
export type VerificationFeeOutcome = 'charged' | 'nothing' | 'short';

/**
 * WAL-20, WAL-21, RAT-16 (Phase 5 Slice 5.4b, read agreed 2026-11-02): the fee for a payment the listener verified -- a
 * percent of the payment, in the verifying's own transaction, so a verification rolled back charges nothing. A balance that
 * cannot pay it, or is frozen, charges nothing and tells the shop at most once a day (agreed 2026-11-02), since BAL-13's
 * notice only fires when a balance crosses a threshold and a shop already short would never hear.
 */
@Injectable()
export class VerificationFees {
  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(LOW_BALANCE_NOTIFIER) private readonly notifier: LowBalanceNotifier,
    @Inject(Leases) private readonly leases: Pick<Leases, 'once'>,
  ) {}

  /**
   * WAL-21, RAT-15 (Slice 5.7, agreed 2026-11-03): what to hold before a shopper goes to a wallet's own checkout, the balance
   * minus what other checkouts hold; null when it can't, so the shopper pays on the page and the shop hears, at most once a day.
   */
  async holdGateway(
    tx: Transaction,
    tenantId: string,
    amount: string,
    now: Date,
  ): Promise<string | null> {
    const rate = await this.rates.current(RateKey.GatewayVerificationPct);
    if (!rate) throw new Error('the gateway fee rate is not seeded');
    const fee = percentOf(toPaisa(amount), rate.value);
    if (fee === 0n) return '0.00';
    const held = await this.balance.heldWithin(tx, tenantId);
    if (held.frozen || toPaisa(held.amount) < fee) {
      await this.tellShort(tx, tenantId, held.amount, now);
      return null;
    }
    return fromPaisa(fee);
  }

  /**
   * WAL-20, BAL-12 (Slice 5.7): the fee held for a checkout, charged now the payment is verified: the rate when it was held, so a
   * rate raised since never asks for more than was set aside. A balance frozen or run down meanwhile charges nothing, for
   * the shopper has paid and must not be refused.
   */
  async chargeHeldGateway(
    tx: Transaction,
    tenantId: string,
    fee: string,
    payment: { sessionId: string; orderId: string; amount: string },
  ): Promise<void> {
    if (toPaisa(fee) === 0n) return;
    const held = await this.balance.heldWithin(tx, tenantId);
    if (held.frozen || toPaisa(held.amount) < toPaisa(fee)) return;
    await this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.VerificationFee,
      amount: fee,
      reference: { method: 'gateway', ...payment },
    });
  }

  async chargeListener(
    tx: Transaction,
    tenantId: string,
    payment: { sessionId: string; orderId: string; amount: string },
    now: Date,
  ): Promise<VerificationFeeOutcome> {
    const rate = await this.rates.current(RateKey.ListenerVerificationPct);
    if (!rate) throw new Error('the listener fee rate is not seeded');
    const fee = percentOf(toPaisa(payment.amount), rate.value);
    if (fee === 0n) return 'nothing';
    const held = await this.balance.heldWithin(tx, tenantId);
    if (held.frozen || toPaisa(held.amount) < fee) {
      await this.tellShort(tx, tenantId, held.amount, now);
      return 'short';
    }
    await this.balance.charge(tx, {
      tenantId,
      type: LedgerEntryType.VerificationFee,
      amount: fromPaisa(fee),
      reference: { method: 'listener', ...payment, percent: rate.value },
    });
    return 'charged';
  }

  /**
   * WAL-21: at most once a day, since BAL-13's notice only fires on a crossing -- once across every API copy, server and
   * restart (Slice 9.4, §119), claimed in the payment's own transaction.
   */
  private async tellShort(
    tx: Transaction,
    tenantId: string,
    balance: string,
    now: Date,
  ): Promise<void> {
    if (await this.leases.once(`fee-short:${tenantId}`, DAY_MS, now, tx)) {
      await this.notifier.notifyFeeShort(tx, tenantId, balance);
    }
  }
}
