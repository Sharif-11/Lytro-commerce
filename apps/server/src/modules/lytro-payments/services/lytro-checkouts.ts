import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GatewayResult,
  isAccountMethod,
  LISTENER_AMOUNT_SLACK_PAISA,
  PaymentReviewReason,
  PaymentWay,
  PlanPaymentStatus,
  type PaymentMethod,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS } from '../../../common/time';
import { toPaisa } from '../../balance/services/money';
import { PaymentQueueService } from '../../billing/services/payment-queue.service';
import type {
  GatewayAccount,
  GatewayStanding,
  WalletGateway,
} from '../../gateway/ports/wallet-gateway';
import { GATEWAY_CALLBACK_ORIGIN, GATEWAY_CLOCK } from '../../gateway/tokens';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { OperatorAlerts } from '../../shared/mail/services/operator-alerts';
import { LytroPaymentMethods } from './lytro-payment-methods';
import { pageIsOpen } from './lytro-payment-pages';
import { Leases } from '../../shared/limits/services/leases';
// §119 (Slice 9.4): a payment's start holds its name while it asks bKash, for long enough to cover the gateway's own
// timeouts; a second tap on any API copy waits its turn this long, then pays on the page.
const START_LEASE_MS = 60_000;
const START_WAIT_MS = 25_000;

/** PAY-06: bKash's address, or null for the shop to pay on the page instead. */
export interface StartedLytroCheckout {
  redirectUrl: string | null;
}

/**
 * ADM-10, VER-08 to VER-11 (2026-11-09): a shop paying Lytro through bKash's own checkout, where the operator set that way. If it can't
 * start, the shop pays on the page, never blocked. The return proves nothing: only bKash's own answer verifies a payment, through the
 * queue's own step and with no fee, and a second return changes nothing. The minute pass asks after a checkout that ran out with no return.
 */
@Injectable()
export class LytroCheckouts {
  private readonly logger = new Logger('LytroCheckouts');

  /**
   * Starts in flight in this process, so a second tap here shares the first's payment at bKash; a tap on another API
   * copy waits its turn under the start's lease (§119, Slice 9.4).
   */
  private readonly starting = new Map<string, Promise<StartedLytroCheckout>>();

  constructor(
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(LytroPaymentMethods) private readonly methods: LytroPaymentMethods,
    @Inject(PaymentQueueService) private readonly queue: PaymentQueueService,
    @Inject(OperatorAlerts) private readonly operators: OperatorAlerts,
    @Inject(GATEWAY_CALLBACK_ORIGIN) private readonly origin: string,
    @Inject(GATEWAY_CLOCK) private readonly clock: () => Date,
    @Inject(Leases) private readonly leases: Pick<Leases, 'inTurn'>,
  ) {}

  start(ref: string, method: PaymentMethod): Promise<StartedLytroCheckout> {
    const key = `${ref}:${method}`;
    const running = this.starting.get(key);
    if (running) return running;
    const begun = this.leases
      .inTurn(`lytro-checkout:${key}`, START_LEASE_MS, START_WAIT_MS, () =>
        this.startOnce(ref, method),
      )
      .then((turn): StartedLytroCheckout => (turn.held ? turn.value : { redirectUrl: null }))
      .finally(() => {
        this.starting.delete(key);
      });
    this.starting.set(key, begun);
    return begun;
  }

  private async startOnce(ref: string, method: PaymentMethod): Promise<StartedLytroCheckout> {
    const now = this.clock();
    if (!isAccountMethod(method)) throw new ApiError('conflict', 'PaymentMethodNotOffered', {});
    const offered = await this.methods.offered();
    if (!offered.some((row) => row.method === method)) {
      throw new ApiError('conflict', 'PaymentMethodNotOffered', {});
    }
    const opened =
      (await this.methods.wayOf(method)) === PaymentWay.Automated
        ? await this.methods.gatewayFor(method, null)
        : null;
    const payment = await this.payments.run(async (tx) => {
      const held = await this.payments.lockByPageRefWithin(tx, ref);
      if (!held) throw new ApiError('not_found', 'PaymentNotFound', {});
      if (!pageIsOpen(held, now)) throw new ApiError('conflict', 'PaymentClosed', {});
      if (held.gatewayUrl !== null && held.payMethod === method) return held;
      if (opened === null) return held;
      await this.payments.setPageWithin(tx, held.id, {
        payMethod: method,
        gatewayPaymentId: null,
        gatewayUrl: null,
        gatewayResult: null,
        test: opened.account.sandbox,
      });
      return { ...held, payMethod: method, gatewayUrl: null };
    });
    if (payment.gatewayUrl !== null) return { redirectUrl: payment.gatewayUrl };
    if (opened === null) return { redirectUrl: null };
    try {
      const checkout = await opened.gateway.initiate(
        { ...opened.account, sessionId: payment.id },
        {
          amount: payment.amount,
          invoice: payment.id.replace(/-/g, '').slice(0, 20),
          payerReference: payment.id.replace(/-/g, '').slice(0, 20),
          callbackUrl: `${this.origin}/v1/pay/${ref}/gateway-return`,
        },
      );
      await this.payments.run((tx) =>
        this.payments.setPageWithin(tx, payment.id, {
          gatewayPaymentId: checkout.paymentId,
          gatewayUrl: checkout.redirectUrl,
        }),
      );
      return { redirectUrl: checkout.redirectUrl };
    } catch (error) {
      // VER-10: the shop pays on the page instead, and the operators hear the checkout needs attention.
      await this.endTry(payment.id, GatewayResult.Failed);
      await this.tellOperators(method, error);
      return { redirectUrl: null };
    }
  }

  /** VER-08, VER-09: the shop back from bKash. What the address says proves nothing, and arriving twice changes nothing. */
  async returned(
    ref: string,
    query: { paymentId: string | undefined; status: string | undefined },
  ): Promise<void> {
    const now = this.clock();
    const payment = await this.payments.findByPageRef(ref);
    if (
      !payment ||
      payment.gatewayPaymentId === null ||
      payment.gatewayPaymentId !== query.paymentId ||
      !pageIsOpen(payment, now)
    ) {
      return;
    }
    const opened = await this.openedFor(payment);
    if (!opened) {
      await this.endTry(payment.id, GatewayResult.Failed);
      return;
    }
    const { gateway, account } = opened;
    try {
      const executing = query.status === 'success';
      let standing: GatewayStanding = executing
        ? await gateway.execute(account, payment.gatewayPaymentId)
        : await gateway.verify(account, payment.gatewayPaymentId);
      if (executing && standing.status !== 'completed') {
        standing = await gateway.verify(account, payment.gatewayPaymentId);
      }
      await this.apply(
        payment,
        standing,
        query.status === 'cancel' ? GatewayResult.Cancelled : GatewayResult.Failed,
        now,
      );
    } catch (error) {
      // VER-10: the shop is told it didn't go through; the minute pass settles a payment that did.
      await this.tellOperators(gateway.method, error);
    }
  }

  /** VER-09: each checkout past its window with no return is asked after; with no answer an hour on, it is let go and the operators told. */
  async reconcile(now = this.clock()): Promise<number> {
    const due = await this.payments.gatewayDue(now);
    let settled = 0;
    for (const payment of due) {
      const paymentId = payment.gatewayPaymentId;
      const opened = paymentId === null ? null : await this.openedFor(payment);
      if (paymentId === null || !opened) {
        await this.endTry(payment.id, GatewayResult.Failed);
        continue;
      }
      try {
        let standing = await opened.gateway.verify(opened.account, paymentId);
        if (standing.status === 'authorised') {
          standing = await opened.gateway.execute(opened.account, paymentId);
        }
        if (standing.status === 'completed') settled += 1;
        await this.apply(payment, standing, GatewayResult.Failed, now);
        if (standing.status !== 'unknown') continue;
      } catch (error) {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.error(`could not ask after a checkout for payment ${payment.id}: ${name}`);
      }
      const expiry = payment.pageExpiresAt?.getTime() ?? now.getTime();
      if (now.getTime() - expiry > HOUR_MS) {
        await this.endTry(payment.id, GatewayResult.Failed);
        await this.tellOperators(opened.gateway.method, null);
      }
    }
    return settled;
  }

  private async apply(
    payment: PlanPaymentRecord,
    standing: GatewayStanding,
    otherwise: GatewayResult,
    now: Date,
  ): Promise<void> {
    if (standing.status === 'completed') await this.settle(payment.id, standing, now);
    else if (standing.status === 'open') await this.endTry(payment.id, otherwise);
  }

  /** PAY-15, VER-09: once, through the queue's own step. Money at another amount, or an ID already used, waits for the operator. */
  private settle(
    paymentId: string,
    paid: Extract<GatewayStanding, { status: 'completed' }>,
    now: Date,
  ): Promise<void> {
    return this.payments.run(async (tx) => {
      const held = await this.payments.findForUpdate(tx, paymentId);
      if (!held || held.status === PlanPaymentStatus.Verified) return;
      if (held.status !== PlanPaymentStatus.Pending || held.transactionId !== null) {
        this.logger.error(`bKash took money for a closed payment ${paymentId}`);
        return;
      }
      const arrived = Number(paid.amount).toFixed(2);
      await this.payments.recordSubmission(
        tx,
        paymentId,
        {
          transactionId: paid.transactionId,
          senderNumber: paid.payerNumber,
          matchesQuoted: true,
        },
        now,
      );
      const apart = toPaisa(arrived) - toPaisa(held.amount);
      const reason =
        (apart < 0n ? -apart : apart) > LISTENER_AMOUNT_SLACK_PAISA
          ? PaymentReviewReason.Amount
          : (await this.payments.transactionIdUsedWithin(tx, paid.transactionId))
            ? PaymentReviewReason.TransactionIdUsed
            : null;
      if (reason !== null) {
        await this.payments.toReviewWithin(tx, paymentId, { reason, amountArrived: arrived });
        return;
      }
      await this.queue.verifyWithin(tx, paymentId, null, now, null, arrived);
    });
  }

  /** This try is over; the shop may try again or pay by hand while the window lasts. */
  private endTry(paymentId: string, result: GatewayResult): Promise<void> {
    return this.payments.run((tx) =>
      this.payments.setPageWithin(tx, paymentId, {
        gatewayPaymentId: null,
        gatewayUrl: null,
        gatewayResult: result,
      }),
    );
  }

  private async openedFor(
    payment: PlanPaymentRecord,
  ): Promise<{ gateway: WalletGateway; account: GatewayAccount } | null> {
    if (payment.payMethod === null || !isAccountMethod(payment.payMethod)) return null;
    return this.methods.gatewayFor(payment.payMethod, payment.id);
  }

  private async tellOperators(method: PaymentMethod, error: unknown): Promise<void> {
    const name = error instanceof Error ? error.name : 'Error';
    this.logger.error(`Lytro's ${method} checkout failed: ${name}`);
    await this.operators
      .alert(
        `Lytro's ${method} checkout needs attention`,
        `A shop's payment through Lytro's own ${method} checkout could not be started or confirmed. Check the keys on Payment methods.`,
      )
      .catch(() => undefined);
  }
}
