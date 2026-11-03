import { Inject, Injectable } from '@nestjs/common';
import type { SelectPaymentSession, Transaction } from '@lytronix/db';
import type { PaymentIdChangeInput, PaymentSubmissionInput } from '@lytronix/validators';
import type { PaymentNotifier } from '../../payment-sessions/ports/payment-notifier';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import { PAYMENT_NOTIFIER } from '../../payment-sessions/tokens';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import type { ReceiptStore } from '../ports/receipt-store';
import { RECEIPT_STORE } from '../tokens';
import { ReceiptMatcher, type AfterCommit } from './receipt-matcher';

/**
 * PAY-07, VER-04, VER-07 (Phase 5 Slice 5.4b, read agreed 2026-11-02): a transaction ID the shopper types or corrects, and
 * the receipt it may find, in one transaction -- so a receipt already in verifies the payment at once. With a phone
 * online staff are told only if the payment is still waiting [5] minutes on; with none, at once.
 */
@Injectable()
export class PaymentSubmissions {
  constructor(
    @Inject(RECEIPT_STORE) private readonly store: ReceiptStore,
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(ReceiptMatcher) private readonly matcher: ReceiptMatcher,
    @Inject(PAYMENT_NOTIFIER) private readonly notifier: PaymentNotifier,
  ) {}

  submit(
    tenantId: string,
    ref: string,
    input: PaymentSubmissionInput,
    now: Date,
  ): Promise<PaymentPageSession> {
    return this.typed(tenantId, input.transactionId, now, (tx) =>
      this.sessions.submitWithin(tx, tenantId, ref, input, now),
    );
  }

  /** PAY-07 (agreed 2026-11-02): the ID corrected, up to [3] times, until someone decides. */
  change(
    tenantId: string,
    ref: string,
    input: PaymentIdChangeInput,
    ip: string | null,
    now: Date,
  ): Promise<PaymentPageSession> {
    return this.typed(tenantId, input.transactionId, now, (tx) =>
      this.sessions.changeTypedWithin(tx, tenantId, ref, input, ip),
    );
  }

  private async typed(
    tenantId: string,
    transactionId: string,
    now: Date,
    take: (tx: Transaction) => Promise<SelectPaymentSession>,
  ): Promise<PaymentPageSession> {
    const after: AfterCommit[] = [];
    const page = await this.store.run(async (tx) => {
      await this.store.holdTransactionId(tx, tenantId, transactionId);
      const session = await take(tx);
      const settled = await this.matcher.matchTypedWithin(tx, tenantId, session, now, after);
      const notice = await this.sessions.noticeWithin(tx, tenantId, settled, now);
      if (notice) after.push(() => this.notifier.paymentToVerify(notice));
      return this.sessions.pageWithin(tx, tenantId, settled, now);
    });
    await this.matcher.send(after);
    return page;
  }
}
