import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectPaymentSession, Transaction } from '@lytronix/db';
import {
  ActorType,
  GatewayResult,
  LISTENER_AMOUNT_SLACK_PAISA,
  PaymentMethod,
  PaymentReviewReason,
  PaymentSessionState,
  PaymentWay,
  StatusOverride,
  TenantState,
  VerificationLevel,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS } from '../../../common/time';
import { toPaisa } from '../../balance/services/money';
import { VerificationFees } from '../../balance/services/verification-fees';
import { OrderService } from '../../orders/services/order.service';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import { PaymentReview } from '../../payment-review/services/payment-review';
import type { PaymentNotifier } from '../../payment-sessions/ports/payment-notifier';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import { PAYMENT_NOTIFIER } from '../../payment-sessions/tokens';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import type { GatewayAccount, GatewayStanding, WalletGateway } from '../ports/wallet-gateway';
import { GATEWAY_CALLBACK_ORIGIN, GATEWAY_CLOCK } from '../tokens';
import { GatewayRegistry } from './gateway-registry';

/**
 * VER-09: whether an order can still take this money. It only moves at execute, so a shopper isn't charged for an order cancelled while
 * they were at the wallet, or one paid some other way meanwhile.
 */
function orderTakes(
  order: { due: string; statusOverride: StatusOverride | null },
  session: { amount: string },
): boolean {
  return (
    order.statusOverride !== StatusOverride.Cancelled &&
    toPaisa(order.due) >= toPaisa(session.amount)
  );
}

/** What settling a completed payment came to, for staff to hear once its transaction is in. */
type Settled =
  | {
      kind: 'verified' | 'review';
      orderNumber: string;
      method: PaymentMethod;
      amount: string;
      transactionId: string;
    }
  | { kind: 'closed'; orderNumber: string; amount: string; transactionId: string }
  | null;

/** Sessions a completed payment may still settle: awaiting it, or another payment of it being checked. */
const SETTLES: readonly PaymentSessionState[] = [
  PaymentSessionState.AwaitingPayment,
  PaymentSessionState.Checking,
  PaymentSessionState.NeedsReview,
];

/** PAY-06: what starting a checkout came to: bKash's address, or null for the shopper to pay on the page instead. */
export interface StartedCheckout {
  redirectUrl: string | null;
}

/**
 * PAY-06, PAY-08, VER-08 to VER-11, WAL-11, WAL-20, WAL-21 (Phase 5 Slice 5.7, read agreed 2026-11-03): a payment through a wallet's
 * own checkout, where the shop chose that way. Before the shopper is sent, the fee is held from the balance (none on a trial or a test
 * account); if it can't be, or the gateway can't start, the shopper pays on the page, never blocked. The return proves nothing:
 * only the gateway's own answer, on the account the payment started on, verifies it. Settling is the same step staff use,
 * with the held fee charged, and a second return changes nothing. A return past the window does nothing; the minute pass asks
 * after a checkout that ran out, before it closes, and executes one the shopper authorised, whose order is still open.
 */
@Injectable()
export class GatewayCheckouts {
  private readonly logger = new Logger('GatewayCheckouts');

  /** Starts in flight on this server, so a second tap shares the first's payment at bKash (found at the Phase 5 close-out). */
  private readonly starting = new Map<string, Promise<StartedCheckout>>();

  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(PaymentReview) private readonly review: PaymentReview,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(VerificationFees) private readonly fees: VerificationFees,
    @Inject(GatewayRegistry) private readonly gateways: GatewayRegistry,
    @Inject(PAYMENT_NOTIFIER) private readonly notifier: PaymentNotifier,
    @Inject(GATEWAY_CALLBACK_ORIGIN) private readonly origin: string,
    @Inject(GATEWAY_CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * PAY-06: the shopper chose a wallet: its own checkout's address, when the shop takes that wallet's money there. Two starts
   * at once, as a second tap sends, share one: bKash makes one payment, and both get its address.
   */
  start(tenantId: string, ref: string, method: PaymentMethod): Promise<StartedCheckout> {
    const key = `${tenantId}:${ref}:${method}`;
    const running = this.starting.get(key);
    if (running) return running;
    const begun = this.startOnce(tenantId, ref, method).finally(() => {
      this.starting.delete(key);
    });
    this.starting.set(key, begun);
    return begun;
  }

  private async startOnce(
    tenantId: string,
    ref: string,
    method: PaymentMethod,
  ): Promise<StartedCheckout> {
    const now = this.clock();
    const prepared = await this.sessions.inTransaction(async (tx) => {
      const session = await this.sessions.lockOpenByRefWithin(tx, tenantId, ref, now);
      if (session.gatewayUrl !== null && session.method === method) {
        return { url: session.gatewayUrl };
      }
      const offered = await this.methods.forShoppersWithin(tx, tenantId);
      if (!offered.some((row) => row.method === method)) {
        throw new ApiError('conflict', 'PaymentMethodNotOffered', {});
      }
      const gateway = this.gateways.forMethod(method);
      if (
        !gateway ||
        (await this.methods.wayOfWithin(tx, tenantId, method)) !== PaymentWay.Automated
      ) {
        return { url: null };
      }
      if (!orderTakes(await this.orders.lockWithin(tx, tenantId, session.orderId), session)) {
        return { url: null };
      }
      const account = await this.methods.automatedAccountWithin(tx, tenantId, method);
      if (!account || !gateway.isConfigured(account.credentials)) return { url: null };
      const free =
        account.sandbox ||
        (await this.sessions.shopStateWithin(tx, tenantId)) === TenantState.Trial;
      const held = free ? '0.00' : await this.fees.holdGateway(tx, tenantId, session.amount, now);
      if (held === null) return { url: null };
      await this.sessions.beginGatewayWithin(tx, tenantId, session.id, {
        method,
        accountId: account.accountId,
        feeHeld: held,
        test: account.sandbox,
      });
      return {
        url: null,
        begun: {
          gateway,
          account: {
            tenantId,
            accountId: account.accountId,
            sandbox: account.sandbox,
            credentials: account.credentials,
            sessionId: session.id,
          },
          session,
          orderNumber: await this.sessions.orderNumberWithin(tx, tenantId, session.orderId),
        },
      };
    });
    if (!('begun' in prepared) || !prepared.begun) return { redirectUrl: prepared.url };
    const { gateway, account, session, orderNumber } = prepared.begun;
    try {
      const checkout = await gateway.initiate(account, {
        amount: session.amount,
        invoice: orderNumber,
        payerReference: orderNumber,
        callbackUrl: `${this.origin}/v1/pay/${ref}/gateway-return`,
      });
      await this.sessions.inTransaction((tx) =>
        this.sessions.gatewayStartedWithin(tx, tenantId, session.id, checkout),
      );
      return { redirectUrl: checkout.redirectUrl };
    } catch (error) {
      // VER-10, WAL-21: the shopper pays on the page instead, and the shop hears its gateway needs attention.
      await this.endTry(tenantId, session.id, GatewayResult.Failed);
      await this.tellAttention(tenantId, method, error);
      return { redirectUrl: null };
    }
  }

  /**
   * VER-08, VER-09: the shopper back from the wallet. What the address says proves nothing: a paymentID that isn't this
   * session's changes nothing, and the outcome is only ever the gateway's own answer. Safe to arrive twice.
   */
  async returned(
    tenantId: string,
    ref: string,
    query: { paymentId: string | undefined; status: string | undefined },
  ): Promise<void> {
    const now = this.clock();
    const session = await this.sessions.inTransaction((tx) =>
      this.sessions.findByRefWithin(tx, tenantId, ref),
    );
    if (
      session.gatewayPaymentId === null ||
      session.gatewayPaymentId !== query.paymentId ||
      session.state !== PaymentSessionState.AwaitingPayment ||
      session.expiresAt <= now
    ) {
      return;
    }
    const opened = await this.openedFor(tenantId, session);
    if (!opened) {
      await this.endTry(tenantId, session.id, GatewayResult.Failed);
      return;
    }
    const { gateway, account } = opened;
    try {
      const takes = await this.takesNow(tenantId, session);
      const executing = query.status === 'success' && takes;
      let standing: GatewayStanding = executing
        ? await gateway.execute(account, session.gatewayPaymentId)
        : await gateway.verify(account, session.gatewayPaymentId);
      // Whatever execute said short of completed, the gateway's own record says where the money is.
      if (executing && standing.status !== 'completed') {
        standing = await gateway.verify(account, session.gatewayPaymentId);
      }
      if (standing.status === 'authorised' && !takes) standing = { status: 'open' };
      await this.apply(
        tenantId,
        session,
        standing,
        query.status === 'cancel' ? GatewayResult.Cancelled : GatewayResult.Failed,
        now,
      );
    } catch (error) {
      // VER-10: the shopper is told it didn't go through; the minute pass settles a payment that did.
      await this.tellAttention(tenantId, gateway.method, error);
    }
  }

  /**
   * VER-09: one shop's minute pass, before its checkouts are let lapse: each past its window with no return is asked after. A payment
   * completed there settles, one the shopper authorised is executed, and the rest let go of their hold and close. If the gateway gives
   * no answer for an hour past the window, it is let go too, and the owner told. How many it settled.
   */
  async reconcile(tenantId: string, now: Date): Promise<number> {
    const due = await this.sessions.inTransaction((tx) =>
      this.sessions.gatewayDueWithin(tx, tenantId, now),
    );
    let settled = 0;
    for (const session of due) {
      const paymentId = session.gatewayPaymentId;
      const opened = paymentId === null ? null : await this.openedFor(tenantId, session);
      if (paymentId === null || !opened) {
        await this.endTry(tenantId, session.id, GatewayResult.Failed);
        continue;
      }
      try {
        let standing = await opened.gateway.verify(opened.account, paymentId);
        if (standing.status === 'authorised') {
          standing = (await this.takesNow(tenantId, session))
            ? await opened.gateway.execute(opened.account, paymentId)
            : { status: 'open' };
        }
        if (standing.status === 'completed') settled += 1;
        await this.apply(tenantId, session, standing, GatewayResult.Failed, now);
        if (standing.status !== 'unknown') continue;
      } catch (error) {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.error(`could not ask after a checkout for tenant ${tenantId}: ${name}`);
      }
      // VER-10: no answer to be had. An hour on, the hold goes, and the owner hears, as money may have moved.
      if (now.getTime() - session.expiresAt.getTime() > HOUR_MS) {
        await this.endTry(tenantId, session.id, GatewayResult.Failed);
        await this.tellAttention(tenantId, opened.gateway.method, null);
      }
    }
    return settled;
  }

  /** The page's reading of the session, after a checkout changed it. */
  page(tenantId: string, ref: string): Promise<PaymentPageSession> {
    return this.sessions.page(tenantId, ref, this.clock());
  }

  private async apply(
    tenantId: string,
    session: SelectPaymentSession,
    standing: GatewayStanding,
    otherwise: GatewayResult,
    now: Date,
  ): Promise<void> {
    if (standing.status === 'completed') {
      await this.settle(tenantId, session.id, standing, now);
    } else if (standing.status === 'open') {
      await this.endTry(tenantId, session.id, otherwise);
    }
  }

  /** PAY-15, VER-09, VER-12: once; the same step staff use, at the gateway's level, the held fee charged in the same transaction. */
  private async settle(
    tenantId: string,
    sessionId: string,
    paid: Extract<GatewayStanding, { status: 'completed' }>,
    now: Date,
  ): Promise<void> {
    const settled = await this.sessions.inTransaction(async (tx): Promise<Settled> => {
      const session = await this.sessions.lockByIdWithin(tx, tenantId, sessionId);
      // Settled already: a second return, or the minute pass after one, changes nothing (VER-09).
      if (session.state === PaymentSessionState.Verified) return null;
      const orderNumber = await this.sessions.orderNumberWithin(tx, tenantId, session.orderId);
      // The money moved at bKash while staff closed the session: it is never dropped, and staff are told of it (found at the
      // Phase 5 close-out). A session another payment of it was being checked on takes the gateway's, which bKash verified.
      if (!SETTLES.includes(session.state)) {
        return {
          kind: 'closed',
          orderNumber,
          amount: Number(paid.amount).toFixed(2),
          transactionId: paid.transactionId,
        };
      }
      const order = await this.orders.lockWithin(tx, tenantId, session.orderId);
      const heldFee = session.feeHeld;
      const typed = await this.sessions.gatewayPaidWithin(tx, tenantId, session, {
        transactionId: paid.transactionId,
        senderNumber: paid.payerNumber,
        at: now,
      });
      // Staff hear what bKash says arrived, which is what a review is about.
      const told = {
        orderNumber,
        method: typed.method ?? PaymentMethod.Bkash,
        amount: Number(paid.amount).toFixed(2),
        transactionId: paid.transactionId,
      };
      const reason = await this.reasonAgainst(tx, typed, order, paid);
      if (reason !== null) {
        await this.sessions.toReviewWithin(tx, tenantId, typed.id, reason);
        return { kind: 'review', ...told };
      }
      await this.fees.chargeHeldGateway(tx, tenantId, heldFee, {
        sessionId: typed.id,
        orderId: typed.orderId,
        amount: typed.amount,
      });
      await this.review.settleWithin(
        tx,
        tenantId,
        typed as SelectPaymentSession & { method: NonNullable<SelectPaymentSession['method']> },
        order,
        typed.amount,
        { id: null, ip: null, type: ActorType.System },
        VerificationLevel.Gateway,
      );
      return { kind: 'verified', ...told };
    });
    await this.tellStaff(tenantId, sessionId, settled);
  }

  /** VER-01, PAY-15: staff hear of a gateway payment as of one the listener checked: verified, or waiting for them. */
  private async tellStaff(tenantId: string, sessionId: string, settled: Settled): Promise<void> {
    if (settled === null) return;
    const { orderNumber, amount, transactionId } = settled;
    let told: Promise<void>;
    if (settled.kind === 'verified') {
      told = this.notifier.paymentVerified({
        tenantId,
        sessionId,
        orderNumber,
        amount,
        transactionId,
      });
    } else if (settled.kind === 'review') {
      told = this.notifier.paymentToVerify({
        tenantId,
        sessionId,
        orderNumber,
        method: settled.method,
        amount,
        transactionId,
      });
    } else {
      told = this.notifier.moneyForClosedOrder({ tenantId, orderNumber, amount, transactionId });
    }
    if (settled.kind === 'closed') {
      this.logger.error(`a gateway payment arrived for a closed session of tenant ${tenantId}`);
    }
    await told.catch((error: unknown) => {
      const name = error instanceof Error ? error.name : 'Error';
      this.logger.error(
        `could not tell staff of a gateway payment for tenant ${tenantId}: ${name}`,
      );
    });
  }

  private async reasonAgainst(
    tx: Transaction,
    session: SelectPaymentSession,
    order: { due: string; statusOverride: StatusOverride | null },
    paid: { amount: string; transactionId: string },
  ): Promise<PaymentReviewReason | null> {
    const asked = toPaisa(session.amount);
    const due = toPaisa(order.due);
    if (order.statusOverride === StatusOverride.Cancelled || due <= 0n) {
      return PaymentReviewReason.OrderClosed;
    }
    const arrived = toPaisa(Number(paid.amount).toFixed(2));
    const apart = arrived > asked ? arrived - asked : asked - arrived;
    if (apart > LISTENER_AMOUNT_SLACK_PAISA || asked > due) return PaymentReviewReason.Amount;
    return (await this.sessions.transactionIdUsedWithin(tx, paid.transactionId))
      ? PaymentReviewReason.TransactionIdUsed
      : null;
  }

  private takesNow(tenantId: string, session: SelectPaymentSession): Promise<boolean> {
    return this.sessions.inTransaction(async (tx) =>
      orderTakes(await this.orders.lockWithin(tx, tenantId, session.orderId), session),
    );
  }

  /** PAY-08, WAL-21: this try is over; its hold ends and the shopper may try again or pay by hand while the window lasts. */
  private endTry(tenantId: string, sessionId: string, result: GatewayResult): Promise<void> {
    return this.sessions.inTransaction((tx) =>
      this.sessions.endGatewayWithin(tx, tenantId, sessionId, result),
    );
  }

  /** WAL-11: the account the payment started on, whatever is selected now; null when its credentials no longer open (WAL-12). */
  private async openedFor(
    tenantId: string,
    session: SelectPaymentSession,
  ): Promise<{ gateway: WalletGateway; account: GatewayAccount } | null> {
    if (session.method === null || session.gatewayAccountId === null) return null;
    const gateway = this.gateways.forMethod(session.method);
    if (!gateway) return null;
    const account = await this.methods.accountCredentials(tenantId, session.gatewayAccountId);
    if (!account) return null;
    return {
      gateway,
      account: {
        tenantId,
        accountId: account.accountId,
        sandbox: account.sandbox,
        credentials: account.credentials,
        sessionId: session.id,
      },
    };
  }

  private async tellAttention(
    tenantId: string,
    method: PaymentMethod,
    error: unknown,
  ): Promise<void> {
    const name = error instanceof Error ? error.name : 'Error';
    this.logger.error(`a ${method} checkout failed for tenant ${tenantId}: ${name}`);
    await this.notifier.gatewayNeedsAttention({ tenantId, method }).catch(() => undefined);
  }
}
