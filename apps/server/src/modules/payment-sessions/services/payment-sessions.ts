import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { SelectPaymentSession, Transaction } from '@lytronix/db';
import {
  FieldProblemCode,
  PaymentSessionSource,
  PaymentSessionState,
  ServerFieldProblemCode,
  type CheckoutPaymentInput,
  type PaymentSubmissionInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { MINUTE_MS } from '../../../common/time';
import { ReservationService } from '../../inventory/services/reservation.service';
import { OrderService } from '../../orders/services/order.service';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import type { PaymentSessionStore } from '../ports/payment-session-store';
import { PAYMENT_PAGE_ORIGIN, PAYMENT_SESSION_STORE } from '../tokens';
import type { OpenedPayment, PaymentPageSession, TrackedPayment } from '../types/payment-sessions';

// PAY-23: 128 random bits, written in 22 URL-safe characters.
const REF_BYTES = 16;

/** PAY-03: a session awaiting payment whose time has run out shows as expired, even before the minute pass. */
function stateAt(session: SelectPaymentSession, now: Date): PaymentSessionState {
  return session.state === PaymentSessionState.AwaitingPayment && session.expiresAt <= now
    ? PaymentSessionState.Expired
    : session.state;
}

/**
 * PAY-01 to PAY-08, PAY-16, PAY-17, D5-4, D5-5 (Phase 5 Slice 5.2, read agreed 2026-10-31): the payment page's sessions.
 * Each belongs to a Lytro order and pays its advance, the amount set here, never typed (amount-only sessions wait for
 * Phase 8). A session is open for the hold's lifetime (one setting, INV-16); its reference, 128 random bits, is the
 * page's address. A transaction ID typed in time moves it to checking, where it waits for verification (Slice 5.3) and
 * no longer runs out (D5-5); one nobody paid in time expires and, at checkout, cancels its order (D5-4).
 */
@Injectable()
export class PaymentSessions {
  constructor(
    @Inject(PAYMENT_SESSION_STORE) private readonly store: PaymentSessionStore,
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(PAYMENT_PAGE_ORIGIN) private readonly origin: string,
  ) {}

  /**
   * PAY-01, PAY-04, SFT-07, LND-10: the session a shopper's order pays its advance through, in the order's transaction.
   * The method chosen must be one the shop offers; the addresses the page returns to must be on the key's websites.
   */
  async openForCheckoutWithin(
    tx: Transaction,
    tenantId: string,
    order: { id: string; advanceDue: string },
    input: CheckoutPaymentInput,
    context: { websites: readonly string[]; offered: readonly ShopperPaymentMethod[]; now: Date },
  ): Promise<OpenedPayment> {
    if (input.method !== undefined && !context.offered.some((row) => row.method === input.method)) {
      throw new FieldsError([
        {
          field: 'payment.method',
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'PaymentMethodNotOffered',
        },
      ]);
    }
    this.refuseAddress(input.returnUrl, context.websites, 'payment.returnUrl');
    if (input.cancelUrl !== undefined) {
      this.refuseAddress(input.cancelUrl, context.websites, 'payment.cancelUrl');
    }
    const minutes = await this.reservations.holdMinutes();
    const session = await this.store.insert(tx, tenantId, {
      ref: randomBytes(REF_BYTES).toString('base64url'),
      orderId: order.id,
      source: PaymentSessionSource.Checkout,
      amount: order.advanceDue,
      method: input.method ?? null,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl ?? null,
      expiresAt: new Date(context.now.getTime() + minutes * MINUTE_MS),
    });
    return {
      paymentUrl: this.urlOf(session.ref),
      amount: session.amount,
      expiresAt: session.expiresAt,
    };
  }

  /** TEN-29: the shop a page's address belongs to; null for none. */
  tenantOfRef(ref: string): Promise<string | null> {
    return this.store.tenantOfRef(ref);
  }

  /** PAY-05, PAY-17: what the page shows -- the order's amount, its state and the methods to pay by. */
  page(tenantId: string, ref: string, now: Date): Promise<PaymentPageSession> {
    return this.store.run(async (tx) => {
      const session = await this.store.findByRef(tx, tenantId, ref);
      if (!session) throw new ApiError('not_found', 'PaymentNotFound', {});
      return this.pageWithin(tx, tenantId, session, now);
    });
  }

  /**
   * PAY-07, PAY-16, D5-5: the transaction ID the shopper typed, for a method the shop offers, and the account they paid
   * into as it stands. Only while the session awaits payment and has time left; an ID a payment already holds is
   * refused. The session moves to checking and no longer runs out.
   */
  submit(
    tenantId: string,
    ref: string,
    input: PaymentSubmissionInput,
    now: Date,
  ): Promise<PaymentPageSession> {
    return this.store.run(async (tx) => {
      const session = await this.store.findByRef(tx, tenantId, ref, true);
      if (!session) throw new ApiError('not_found', 'PaymentNotFound', {});
      const state = stateAt(session, now);
      if (state !== PaymentSessionState.AwaitingPayment) {
        throw new ApiError('conflict', 'PaymentSessionClosed', { state });
      }
      const offered = await this.methods.forShoppersWithin(tx, tenantId);
      const account = offered.find((row) => row.method === input.method);
      if (!account) {
        throw new FieldsError([
          {
            field: 'method',
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'PaymentMethodNotOffered',
          },
        ]);
      }
      if (await this.store.transactionIdUsed(tx, input.transactionId)) {
        throw new FieldsError(
          [
            {
              field: 'transactionId',
              problem: ServerFieldProblemCode.AlreadyUsed,
              messageKey: 'TransactionIdAlreadyUsed',
            },
          ],
          'conflict',
        );
      }
      const submitted = await this.store.submit(tx, tenantId, session.id, {
        method: input.method,
        transactionId: input.transactionId,
        senderNumber: input.senderNumber ?? null,
        paidTo: {
          accountId: account.accountId,
          accountName: account.accountName,
          number: account.number,
          bankName: account.bank?.bankName ?? null,
          accountNumber: account.bank?.accountNumber ?? null,
        },
        submittedAt: now,
      });
      return this.pageWithin(tx, tenantId, submitted, now, offered);
    });
  }

  /**
   * PAY-03, D5-4: one shop's minute pass -- each session still awaiting payment whose time ran out expires, and a
   * checkout's order is cancelled with it ("advance not paid"), its stock let go, in one transaction. A staff link's
   * order stays as it is (agreed 2026-10-31). Safe to run again.
   */
  expireDue(tenantId: string, now: Date): Promise<number> {
    return this.store.run(async (tx) => {
      const due = await this.store.lockExpired(tx, tenantId, now);
      for (const session of due) {
        await this.store.setState(tx, tenantId, session.id, PaymentSessionState.Expired);
        if (session.source === PaymentSessionSource.Checkout) {
          await this.orders.cancelUnpaidWithin(tx, tenantId, session.orderId, now);
        }
      }
      return due.length;
    });
  }

  listShopIds(): Promise<string[]> {
    return this.store.listShopIds();
  }

  /** ORD-17: the open payment of the order with this tracking ID, for its tracking page; null for none. */
  ofTracked(tenantId: string, trackingId: string, now: Date): Promise<TrackedPayment | null> {
    return this.store.run(async (tx) => {
      const session = await this.store.openForTracking(tx, tenantId, trackingId);
      if (!session) return null;
      return {
        paymentUrl: this.urlOf(session.ref),
        amount: session.amount,
        state: stateAt(session, now),
        expiresAt: session.expiresAt,
      };
    });
  }

  private async pageWithin(
    tx: Transaction,
    tenantId: string,
    session: SelectPaymentSession,
    now: Date,
    offered?: ShopperPaymentMethod[],
  ): Promise<PaymentPageSession> {
    return {
      orderNumber: await this.store.orderNumberOf(tx, tenantId, session.orderId),
      amount: session.amount,
      state: stateAt(session, now),
      expiresAt: session.expiresAt,
      method: session.method,
      methods: offered ?? (await this.methods.forShoppersWithin(tx, tenantId)),
      returnUrl: session.returnUrl,
      cancelUrl: session.cancelUrl,
      submitted:
        session.transactionId !== null && session.submittedAt !== null && session.method !== null
          ? {
              method: session.method,
              transactionId: session.transactionId,
              senderNumber: session.senderNumber,
              submittedAt: session.submittedAt,
            }
          : null,
    };
  }

  /** PAY-04: an address the page returns to must be on one of the key's websites. */
  private refuseAddress(address: string, websites: readonly string[], field: string): void {
    const origin = new URL(address).origin;
    if (websites.includes(origin)) return;
    throw new FieldsError([
      { field, problem: FieldProblemCode.NotAllowed, messageKey: 'ReturnAddressNotAllowed' },
    ]);
  }

  private urlOf(ref: string): string {
    return `${this.origin}/${ref}`;
  }
}
