import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  SelectListenerDevice,
  SelectListenerMessage,
  SelectPaymentSession,
  Transaction,
} from '@lytronix/db';
import {
  ActorType,
  LISTENER_AMOUNT_SLACK_PAISA,
  LISTENER_OLD_RECEIPT_MINUTES,
  ListenerMessageStatus,
  PaymentReviewReason,
  PaymentSessionState,
  StatusOverride,
  TenantState,
  VerificationLevel,
} from '@lytronix/validators';
import { MINUTE_MS } from '../../../common/time';
import { toPaisa } from '../../balance/services/money';
import { VerificationFees } from '../../balance/services/verification-fees';
import type { ListenerStore } from '../../listener/ports/listener-store';
import { LISTENER_STORE } from '../../listener/tokens';
import { OrderService } from '../../orders/services/order.service';
import type { OrderRecord } from '../../orders/types/orders';
import { PaymentReview } from '../../payment-review/services/payment-review';
import type { PaymentNotifier } from '../../payment-sessions/ports/payment-notifier';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import { PAYMENT_NOTIFIER } from '../../payment-sessions/tokens';
import type { ReceiptStore } from '../ports/receipt-store';
import { RECEIPT_STORE } from '../tokens';

/** A notice to send once its transaction has committed. */
export type AfterCommit = () => Promise<void>;

/** A receipt as the parser read it, with what the phone said of it. */
export interface IncomingReceipt {
  sender: string;
  text: string;
  receivedAt: Date;
  method: SelectListenerMessage['method'];
  transactionId: string;
  amount: string;
  senderNumber: string | null;
}

// PAY-14: a session a receipt may still settle, or send to staff.
const STILL_OPEN: readonly PaymentSessionState[] = [
  PaymentSessionState.Checking,
  PaymentSessionState.NeedsReview,
];

/**
 * VER-02 to VER-05, WAL-20, WAL-21, D5-4 (Phase 5 Slice 5.4b, read agreed 2026-11-02): a receipt meets the payment that
 * typed its transaction ID, whichever came first, within one shop only. It verifies the payment when the amount (within
 * 0.01 TK), the sender the shopper gave and the wallet all agree, and it arrived after the page opened -- then the listener
 * fee is charged, unless the shop is on a trial, in the same transaction; a balance too short for it sends the payment
 * to staff for free. Anything else goes to staff too with its reason, and a receipt for a closed order never reopens it.
 * A receipt stays unclaimed until someone types its ID, so money that reaches the number for other reasons is left alone.
 */
@Injectable()
export class ReceiptMatcher {
  private readonly logger = new Logger('ReceiptMatcher');

  constructor(
    @Inject(RECEIPT_STORE) private readonly store: ReceiptStore,
    @Inject(LISTENER_STORE) private readonly shops: Pick<ListenerStore, 'shopOf'>,
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(PaymentReview) private readonly review: PaymentReview,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(VerificationFees) private readonly fees: VerificationFees,
    @Inject(PAYMENT_NOTIFIER) private readonly notifier: PaymentNotifier,
  ) {}

  /**
   * VER-02, VER-03: one receipt in from a phone. A phone sending its own receipt again adds nothing and is told how it
   * stands; another phone's copy is a duplicate. What the receipt settled is told once it has committed.
   */
  async receive(
    device: SelectListenerDevice & { tenantId: string },
    receipt: IncomingReceipt,
    now: Date,
  ): Promise<SelectListenerMessage> {
    const tenantId = device.tenantId;
    const after: AfterCommit[] = [];
    const row = await this.store.run(async (tx) => {
      await this.store.holdTransactionId(tx, tenantId, receipt.transactionId);
      const own = await this.store.ofPhone(tx, tenantId, device.id, receipt.transactionId);
      if (own) return own;
      const holder = await this.store.holderOf(tx, tenantId, receipt.transactionId);
      const inserted = await this.store.insert(tx, tenantId, {
        deviceId: device.id,
        sender: receipt.sender,
        method: receipt.method,
        transactionId: receipt.transactionId,
        amount: receipt.amount,
        senderNumber: receipt.senderNumber,
        // VER-03: the holder's text is the text; a copy keeps none.
        rawText: holder ? null : receipt.text,
        status: holder ? ListenerMessageStatus.Duplicate : ListenerMessageStatus.Unmatched,
        ignoredReason: null,
        receivedAt: receipt.receivedAt,
      });
      if (holder) return inserted;
      // Staff got there first, by hand: the receipt is used, and by hand there is no fee (WAL-20).
      const paid = await this.store.paymentCarrying(tx, tenantId, receipt.transactionId);
      if (paid) {
        return this.store.settle(tx, tenantId, inserted.id, {
          status: ListenerMessageStatus.Matched,
          reviewReason: null,
          sessionId: paid.sessionId,
          paymentId: paid.id,
        });
      }
      const session = await this.sessions.lockTypedWithin(tx, tenantId, receipt.transactionId);
      if (!session) return inserted;
      return this.settleWithin(tx, tenantId, session, inserted, now, after);
    });
    await this.send(after);
    return row;
  }

  /**
   * VER-04: a transaction ID just typed finds a receipt already in, in the typing's own transaction, the ID already held
   * (`holdTransactionId`). The session as it now stands.
   */
  async matchTypedWithin(
    tx: Transaction,
    tenantId: string,
    session: SelectPaymentSession,
    now: Date,
    after: AfterCommit[],
  ): Promise<SelectPaymentSession> {
    if (session.transactionId === null) return session;
    const holder = await this.store.holderOf(tx, tenantId, session.transactionId);
    if (!holder) return session;
    if (holder.status !== ListenerMessageStatus.Unmatched) {
      // PAY-16: the receipt already claims another payment, which staff are to decide.
      return this.sessions.toReviewWithin(
        tx,
        tenantId,
        session.id,
        PaymentReviewReason.TransactionIdUsed,
      );
    }
    await this.settleWithin(tx, tenantId, session, holder, now, after);
    return this.sessions.findWithin(tx, tenantId, session.id);
  }

  /** PAY-15, VER-12: the receipt and the session it claims -- verified with the fee, or sent to staff with the reason. */
  private async settleWithin(
    tx: Transaction,
    tenantId: string,
    session: SelectPaymentSession,
    receipt: SelectListenerMessage,
    now: Date,
    after: AfterCommit[],
  ): Promise<SelectListenerMessage> {
    // D5-4: money that turns up for a payment already closed goes to staff; it never reopens the order.
    if (!STILL_OPEN.includes(session.state)) {
      const orderNumber = await this.sessions.orderNumberWithin(tx, tenantId, session.orderId);
      after.push(() =>
        this.notifier.moneyForClosedOrder({
          tenantId,
          orderNumber,
          amount: receipt.amount ?? session.amount,
          transactionId: receipt.transactionId ?? '',
        }),
      );
      return this.heldForStaff(tx, tenantId, receipt, session.id, PaymentReviewReason.OrderClosed);
    }
    // Slice 5.7 (agreed 2026-11-03): the shop checks this wallet by hand: the receipt waits beside the payment for staff, free.
    if (
      session.method === receipt.method &&
      (await this.sessions.byHandWithin(tx, tenantId, session.method))
    ) {
      return this.heldForStaff(tx, tenantId, receipt, session.id, PaymentReviewReason.ByHand);
    }
    const order = await this.orders.lockWithin(tx, tenantId, session.orderId);
    const reason =
      this.reasonAgainst(session, order, receipt) ??
      ((await this.sessions.transactionIdUsedWithin(tx, receipt.transactionId ?? ''))
        ? PaymentReviewReason.TransactionIdUsed
        : null) ??
      (await this.feeRefusal(tx, tenantId, session, now));
    if (reason !== null) {
      const told = await this.sessions.toReviewWithin(tx, tenantId, session.id, reason);
      const notice = await this.sessions.noticeWithin(tx, tenantId, told, now);
      if (notice) after.push(() => this.notifier.paymentToVerify(notice));
      return this.heldForStaff(tx, tenantId, receipt, session.id, reason);
    }
    await this.review.settleWithin(
      tx,
      tenantId,
      session as SelectPaymentSession & { method: NonNullable<SelectPaymentSession['method']> },
      order,
      session.amount,
      { id: null, ip: null, type: ActorType.System },
      VerificationLevel.Listener,
    );
    after.push(() =>
      this.notifier.paymentVerified({
        tenantId,
        sessionId: session.id,
        orderNumber: order.orderNumber,
        amount: session.amount,
        transactionId: receipt.transactionId ?? '',
      }),
    );
    return (await this.store.holderOf(tx, tenantId, receipt.transactionId ?? '')) ?? receipt;
  }

  /**
   * VER-02, VER-04 (amended 2026-11-02): why this receipt may not verify this payment by itself: its order closed or paid
   * another way; another wallet's money; a receipt from before the page opened, whose money was for something else; another
   * amount; or another sender than the shopper gave. Null when they agree.
   */
  private reasonAgainst(
    session: SelectPaymentSession,
    order: OrderRecord,
    receipt: SelectListenerMessage,
  ): PaymentReviewReason | null {
    const asked = toPaisa(session.amount);
    const due = toPaisa(order.due);
    if (order.statusOverride === StatusOverride.Cancelled || due <= 0n) {
      return PaymentReviewReason.OrderClosed;
    }
    if (session.method !== receipt.method) return PaymentReviewReason.Wallet;
    const pageOpened = session.createdAt.getTime() - LISTENER_OLD_RECEIPT_MINUTES * MINUTE_MS;
    if (receipt.receivedAt.getTime() < pageOpened) return PaymentReviewReason.OldReceipt;
    const arrived = toPaisa(receipt.amount ?? '0');
    const apart = arrived > asked ? arrived - asked : asked - arrived;
    if (apart > LISTENER_AMOUNT_SLACK_PAISA || asked > due) return PaymentReviewReason.Amount;
    if (
      session.senderNumber !== null &&
      receipt.senderNumber !== null &&
      session.senderNumber !== receipt.senderNumber
    ) {
      return PaymentReviewReason.Sender;
    }
    return null;
  }

  /** WAL-20, WAL-21 (trial free, agreed 2026-11-02): the listener's fee charged; a balance too short for it is the reason. */
  private async feeRefusal(
    tx: Transaction,
    tenantId: string,
    session: SelectPaymentSession,
    now: Date,
  ): Promise<PaymentReviewReason | null> {
    const shop = await this.shops.shopOf(tx, tenantId);
    if (shop?.state === TenantState.Trial) return null;
    const fee = await this.fees.chargeListener(
      tx,
      tenantId,
      { sessionId: session.id, orderId: session.orderId, amount: session.amount },
      now,
    );
    return fee === 'short' ? PaymentReviewReason.LowBalance : null;
  }

  private heldForStaff(
    tx: Transaction,
    tenantId: string,
    receipt: SelectListenerMessage,
    sessionId: string,
    reason: PaymentReviewReason,
  ): Promise<SelectListenerMessage> {
    return this.store.settle(tx, tenantId, receipt.id, {
      status: ListenerMessageStatus.NeedsReview,
      reviewReason: reason,
      sessionId,
      paymentId: null,
    });
  }

  /** Notices go after the commit; one that fails changes nothing. */
  async send(after: readonly AfterCommit[]): Promise<void> {
    for (const notice of after) {
      await notice().catch((error: unknown) => {
        this.logger.error(`could not send a payment notice: ${String(error)}`);
      });
    }
  }
}
