import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectLytroListenerMessage, Transaction } from '@lytronix/db';
import {
  bdMobileNumber,
  LISTENER_OLD_RECEIPT_MINUTES,
  LISTENER_TEXT_KEPT_DAYS,
  ListenerMessageStatus,
  PaymentReviewReason,
  PlanPaymentStatus,
  type ListenerIgnoredReason,
  type ListenerReceiptsQuery,
  type ListenerRecentQuery,
  type PaymentMethod,
} from '@lytronix/validators';
import { DAY_MS, MINUTE_MS, startOfDayDhaka } from '../../../common/time';
import { toPaisa } from '../../balance/services/money';
import { PaymentQueueService } from '../../billing/services/payment-queue.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import type { LytroReceiptStore } from '../ports/lytro-receipt-store';
import { LYTRO_RECEIPT_STORE } from '../tokens';
import type {
  LytroReceiptItem,
  LytroReceiptPage,
  LytroRecentItem,
  LytroRecent,
} from '../types/lytro-receipts';

/** A receipt from Lytro's own phone, as the parser read it. */
export interface IncomingLytroReceipt {
  deviceId: string;
  sender: string;
  text: string;
  receivedAt: Date;
  method: PaymentMethod;
  transactionId: string;
  amount: string;
  senderNumber: string | null;
}

// VER-02: an amount matches within 0.01 TK.
const AMOUNT_SLACK_PAISA = 1n;

// BIL-15: a request nothing can verify any more -- and one already settled, whose ID a late receipt only confirms.
const CLOSED: readonly PlanPaymentStatus[] = [
  PlanPaymentStatus.Expired,
  PlanPaymentStatus.Cancelled,
  PlanPaymentStatus.Rejected,
];

/**
 * PAY-21, D5-3, BIL-06, BIL-15, BAL-03 (Phase 5 Slice 5.6, read agreed 2026-11-03): sellers' money for plans, add-ons and
 * top-ups, read by Lytro's own listener phone. A receipt meets the payment a seller typed its transaction ID on in the
 * dashboard's wallet step, whichever came first. When the amount (within 0.01 TK) and the sender agree and it arrived after the
 * quote, the payment verifies by itself through the queue's own step, with no fee and no cap (agreed 2026-11-03). Otherwise
 * it goes to the operator's queue with the reason and what arrived; a late one never activates anything (BIL-15).
 */
@Injectable()
export class LytroReceipts {
  private readonly logger = new Logger('LytroReceipts');

  constructor(
    @Inject(LYTRO_RECEIPT_STORE) private readonly messages: LytroReceiptStore,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PaymentQueueService) private readonly queue: PaymentQueueService,
  ) {}

  /** VER-02, VER-03: one receipt in. A phone sending its own again adds nothing; another phone's copy is a duplicate. */
  take(receipt: IncomingLytroReceipt, now: Date): Promise<SelectLytroListenerMessage> {
    return this.messages.run(async (tx) => {
      await this.messages.holdTransactionId(tx, receipt.transactionId);
      const own = await this.messages.ofPhone(tx, receipt.deviceId, receipt.transactionId);
      if (own) return own;
      const holder = await this.messages.holderOf(tx, receipt.transactionId);
      const inserted = await this.messages.insert(tx, {
        deviceId: receipt.deviceId,
        sender: receipt.sender,
        method: receipt.method,
        transactionId: receipt.transactionId,
        amount: receipt.amount,
        senderNumber: receipt.senderNumber,
        rawText: holder ? null : receipt.text,
        status: holder ? ListenerMessageStatus.Duplicate : ListenerMessageStatus.Unmatched,
        ignoredReason: null,
        receivedAt: receipt.receivedAt,
      });
      if (holder) return inserted;
      const payment = await this.payments.lockTypedWithin(tx, receipt.transactionId);
      return payment ? this.settleWithin(tx, payment, inserted, now) : inserted;
    });
  }

  /** VER-06, LSN-04: kept as verifying nothing, without its text. */
  ignore(
    message: { deviceId: string; sender: string; receivedAt: Date },
    reason: ListenerIgnoredReason,
    parsed: {
      method: PaymentMethod;
      transactionId: string;
      amount: string;
      senderNumber: string | null;
    } | null,
  ): Promise<SelectLytroListenerMessage> {
    return this.messages.insertAlone({
      ...message,
      method: parsed?.method ?? null,
      transactionId: parsed?.transactionId ?? null,
      amount: parsed?.amount ?? null,
      senderNumber: parsed?.senderNumber ?? null,
      rawText: null,
      status: ListenerMessageStatus.Ignored,
      ignoredReason: reason,
    });
  }

  /**
   * VER-04: the transaction ID a seller just typed finds a receipt already in, after their submission has committed, the ID
   * held so a receipt arriving at that moment and this take turns. The payment as it now stands.
   */
  async afterSubmit(payment: PlanPaymentRecord, now = new Date()): Promise<PlanPaymentRecord> {
    const transactionId = payment.transactionId;
    if (transactionId === null) return payment;
    await this.messages.run(async (tx) => {
      await this.messages.holdTransactionId(tx, transactionId);
      const holder = await this.messages.holderOf(tx, transactionId);
      if (!holder) return;
      const locked = await this.payments.findForUpdate(tx, payment.id);
      if (!locked) return;
      if (holder.status !== ListenerMessageStatus.Unmatched) {
        // PAY-16: the receipt already claims another payment, which the operator is to decide.
        await this.payments.toReviewWithin(tx, locked.id, {
          reason: PaymentReviewReason.TransactionIdUsed,
          amountArrived: null,
        });
        return;
      }
      await this.settleWithin(tx, locked, holder, now);
    });
    return this.payments.find(payment.id);
  }

  /** The app's home screen for Lytro's own phone. */
  async recent(deviceId: string, query: ListenerRecentQuery, now: Date): Promise<LytroRecent> {
    const [rows, today] = await Promise.all([
      this.messages.recent(deviceId, query.limit),
      this.messages.counts(deviceId, startOfDayDhaka(now)),
    ]);
    return { receipts: rows.map((row) => this.recentOf(row)), today };
  }

  /** PAY-21: the receipts the operator reads and searches, unclaimed money among them. */
  async list(query: ListenerReceiptsQuery): Promise<LytroReceiptPage> {
    const search =
      query.q !== undefined ? (bdMobileNumber(query.q) ?? query.q.toUpperCase()) : null;
    const found = await this.messages.list(
      { status: query.status, search },
      { offset: (query.page - 1) * query.limit, limit: query.limit },
    );
    return {
      receipts: found.rows.map((row) => this.itemOf(row)),
      page: query.page,
      limit: query.limit,
      total: found.total,
      pages: Math.ceil(found.total / query.limit),
    };
  }

  /** LSN-17: text past [90] days redacted, keeping the ID, amount, status and time. Safe to run again. */
  redactOld(now: Date): Promise<{ redacted: number; removed: number }> {
    return this.messages.redact(new Date(now.getTime() - LISTENER_TEXT_KEPT_DAYS * DAY_MS));
  }

  private async settleWithin(
    tx: Transaction,
    payment: PlanPaymentRecord,
    receipt: SelectLytroListenerMessage,
    now: Date,
  ): Promise<SelectLytroListenerMessage> {
    // BIL-15: money for a request already closed goes to the operator, and activates nothing; one settled already just
    // confirms it.
    if (payment.status === PlanPaymentStatus.Verified) {
      return this.messages.settle(tx, receipt.id, {
        status: ListenerMessageStatus.Matched,
        reviewReason: null,
        planPaymentId: payment.id,
      });
    }
    const reason = CLOSED.includes(payment.status)
      ? PaymentReviewReason.RequestClosed
      : (this.reasonAgainst(payment, receipt) ??
        ((await this.payments.transactionIdUsedWithin(tx, receipt.transactionId ?? ''))
          ? PaymentReviewReason.TransactionIdUsed
          : null));
    if (reason !== null) {
      if (reason !== PaymentReviewReason.RequestClosed) {
        await this.payments.toReviewWithin(tx, payment.id, {
          reason,
          amountArrived: receipt.amount,
        });
      }
      return this.messages.settle(tx, receipt.id, {
        status: ListenerMessageStatus.NeedsReview,
        reviewReason: reason,
        planPaymentId: payment.id,
      });
    }
    await this.queue.verifyWithin(tx, payment.id, null, now, null, receipt.amount ?? undefined);
    this.logger.log(`seller's payment ${payment.id} verified by Lytro's phone`);
    return this.messages.settle(tx, receipt.id, {
      status: ListenerMessageStatus.Matched,
      reviewReason: null,
      planPaymentId: payment.id,
    });
  }

  /**
   * VER-02, VER-04, BIL-06: why this receipt may not verify this payment by itself: from before the quote, so its money was for
   * something else; another amount than quoted; or another sender than the seller gave. Null when they agree.
   */
  private reasonAgainst(
    payment: PlanPaymentRecord,
    receipt: SelectLytroListenerMessage,
  ): PaymentReviewReason | null {
    const quoted = payment.quotedAt.getTime() - LISTENER_OLD_RECEIPT_MINUTES * MINUTE_MS;
    if (receipt.receivedAt.getTime() < quoted) return PaymentReviewReason.OldReceipt;
    const asked = toPaisa(payment.amount);
    const arrived = toPaisa(receipt.amount ?? '0');
    if ((arrived > asked ? arrived - asked : asked - arrived) > AMOUNT_SLACK_PAISA) {
      return PaymentReviewReason.Amount;
    }
    if (
      payment.senderNumber !== null &&
      receipt.senderNumber !== null &&
      payment.senderNumber !== receipt.senderNumber
    ) {
      return PaymentReviewReason.Sender;
    }
    return null;
  }

  private recentOf(row: SelectLytroListenerMessage): LytroRecentItem {
    return {
      id: row.id,
      method: row.method,
      amount: row.amount,
      transactionId: row.transactionId,
      status: row.status,
      reviewReason: row.reviewReason,
      ignoredReason: row.ignoredReason,
      // A seller's payment has no order number; the phone shows the receipt alone.
      orderNumber: null,
      receivedAt: row.receivedAt,
    };
  }

  private itemOf(row: SelectLytroListenerMessage): LytroReceiptItem {
    return {
      ...this.recentOf(row),
      senderNumber: row.senderNumber,
      deviceId: row.deviceId,
      planPaymentId: row.planPaymentId,
      text: row.rawText,
    };
  }
}
