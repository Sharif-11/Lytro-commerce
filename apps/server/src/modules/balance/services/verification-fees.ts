import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { LedgerEntryType, RateKey } from '@lytronix/validators';
import { SlidingWindow } from '../../../common/sliding-window';
import { DAY_MS } from '../../../common/time';
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
  private readonly shortNotices = new SlidingWindow(DAY_MS);

  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(LOW_BALANCE_NOTIFIER) private readonly notifier: LowBalanceNotifier,
  ) {}

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
      this.shortNotices.sweep(now.getTime());
      if (this.shortNotices.take(tenantId, 1, now.getTime()).allowed) {
        await this.notifier.notifyFeeShort(tx, tenantId, held.amount);
      }
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
}
