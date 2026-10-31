import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaymentDecision, SelectPaymentSession, Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  NEW_SHOP_PAYMENT_CAP_AMOUNT,
  NEW_SHOP_PAYMENT_CAP_DAYS,
  PAGE_REPORTS_PER_VISITOR_PER_HOUR,
  PAYMENT_LINK_HOURS,
  PlatformSettingKey,
  PaymentSessionSource,
  PaymentSessionState,
  ServerFieldProblemCode,
  StatusOverride,
  TenantState,
  type CheckoutPaymentInput,
  type PaymentLinkInput,
  type PaymentPageReportInput,
  type PaymentSubmissionInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { DAY_MS, HOUR_MS, MINUTE_MS, startOfDayDhaka } from '../../../common/time';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { ReservationService } from '../../inventory/services/reservation.service';
import { OrderService } from '../../orders/services/order.service';
import type { OrderRecord } from '../../orders/types/orders';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { PaymentNotifier } from '../ports/payment-notifier';
import type { PaymentSessionStore } from '../ports/payment-session-store';
import { PAYMENT_NOTIFIER, PAYMENT_PAGE_ORIGIN, PAYMENT_SESSION_STORE } from '../tokens';
import type { OpenedPayment, PaymentPageSession, TrackedPayment } from '../types/payment-sessions';

// PAY-23: 128 random bits, written in 22 URL-safe characters.
const REF_BYTES = 16;

/** PAY-03: a session awaiting payment whose time has run out shows as expired, even before the minute pass. */
function stateAt(session: SelectPaymentSession, now: Date): PaymentSessionState {
  return session.state === PaymentSessionState.AwaitingPayment && session.expiresAt <= now
    ? PaymentSessionState.Expired
    : session.state;
}

// VER-01, PAY-14 (Slice 5.3): a session staff may verify or reject -- a transaction ID typed and not yet decided.
const DECIDABLE: readonly PaymentSessionState[] = [
  PaymentSessionState.Checking,
  PaymentSessionState.NeedsReview,
];

/**
 * PAY-24 (agreed 2026-10-31): what a payment link asks for, in paisa -- the advance still owed, else what is due; or the
 * whole amount due when staff ask for it.
 */
function linkAmountOf(
  order: Pick<OrderRecord, 'grandTotal' | 'advanceDue' | 'due'>,
  full: boolean,
): bigint {
  const due = toPaisa(order.due);
  const advanceOwed = toPaisa(order.advanceDue) - (toPaisa(order.grandTotal) - due);
  return !full && advanceOwed > 0n ? advanceOwed : due;
}

/**
 * PAY-01 to PAY-08, PAY-16, PAY-17, D5-4, D5-5 (Phase 5 Slice 5.2, read agreed 2026-10-31): the payment page's sessions.
 * Each belongs to a Lytro order and pays its advance, the amount set here, never typed (amount-only sessions wait for
 * Phase 8). A session is open for the hold's lifetime (one setting, INV-16); its reference, 128 random bits, is the
 * page's address. A transaction ID typed in time moves it to checking, where it waits for verification (Slice 5.3) and
 * no longer runs out (D5-5); one nobody paid in time expires and, at checkout, cancels its order (D5-4). Staff may send
 * a link for an order instead (PAY-24), and a shopper may report a page to Lytro (TVR-02). Since Slice 5.3 staff are
 * told of a transaction ID to verify (VER-01), and a new shop's online payments a day are capped (TVR-04).
 */
@Injectable()
export class PaymentSessions {
  private readonly logger = new Logger('PaymentSessions');

  constructor(
    @Inject(PAYMENT_SESSION_STORE) private readonly store: PaymentSessionStore,
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(PAYMENT_NOTIFIER) private readonly notifier: PaymentNotifier,
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
    await this.refuseOverCap(tx, tenantId, order.advanceDue, context.now);
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
    return this.openedOf(session);
  }

  /**
   * PAY-24 (Slice 5.2b, read agreed 2026-10-31): a payment link staff send the customer by message -- the page, open
   * [24] hours, for the advance still owed, else what is due, or the whole due when asked. A session of the order's
   * still awaiting money closes for it; one being checked refuses the link. The link only expires: its order stays as
   * it is, and staff may make another.
   */
  async makeLink(
    tenantId: string,
    orderId: string,
    input: PaymentLinkInput,
    actor: CatalogueActor,
    now: Date,
  ): Promise<OpenedPayment> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(async (tx) => {
      const order = await this.orders.lockWithin(tx, tenantId, orderId);
      if (order.statusOverride === StatusOverride.Cancelled) {
        throw new ApiError('conflict', 'OrderIsCancelled', {});
      }
      const amount = linkAmountOf(order, input.full === true);
      if (amount <= 0n) throw new ApiError('conflict', 'OrderNothingDue', {});
      // TVR-03: a page Lytro suspended takes no new payments; WAL-06: nor one with no method to pay by.
      if ((await this.store.paymentPageOf(tx, tenantId))?.suspendedAt) {
        throw new ApiError('conflict', 'ShopPaymentPageSuspended', {});
      }
      if ((await this.methods.forShoppersWithin(tx, tenantId)).length === 0) {
        throw new ApiError('conflict', 'NoPaymentMethod', { reason: 'no_payment_method' });
      }
      const open = await this.store.openForOrder(tx, tenantId, order.id);
      if (open) {
        if (open.state !== PaymentSessionState.AwaitingPayment) {
          throw new ApiError('conflict', 'PaymentBeingChecked', {});
        }
        await this.store.setState(tx, tenantId, open.id, PaymentSessionState.Cancelled);
      }
      await this.refuseOverCap(tx, tenantId, fromPaisa(amount), now);
      const session = await this.store.insert(tx, tenantId, {
        ref: randomBytes(REF_BYTES).toString('base64url'),
        orderId: order.id,
        source: PaymentSessionSource.StaffLink,
        amount: fromPaisa(amount),
        method: null,
        returnUrl: null,
        cancelUrl: null,
        expiresAt: new Date(now.getTime() + PAYMENT_LINK_HOURS * HOUR_MS),
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PaymentLinkMade,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, amount: session.amount, replaced: open !== null },
      );
      return this.openedOf(session);
    });
  }

  /** VER-01, PAY-14 (Slice 5.3): one transaction, for a decision on a session and what it settles. */
  inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.run(work);
  }

  /** VER-01, PAY-14: a session staff may decide -- a transaction ID typed and waiting -- held until the decision. */
  async lockToDecideWithin(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectPaymentSession & { method: NonNullable<SelectPaymentSession['method']> }> {
    const session = await this.store.findById(tx, tenantId, id, true);
    if (!session) throw new ApiError('not_found', 'OrderPaymentNotFound', {});
    if (!DECIDABLE.includes(session.state) || session.method === null) {
      throw new ApiError('conflict', 'PaymentNotToVerify', { state: session.state });
    }
    return { ...session, method: session.method };
  }

  /** VER-01, PAY-14: the session verified or rejected, by whom and when. */
  decideWithin(
    tx: Transaction,
    tenantId: string,
    id: string,
    decision: PaymentDecision,
  ): Promise<void> {
    return this.store.decide(tx, tenantId, id, decision);
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
  async submit(
    tenantId: string,
    ref: string,
    input: PaymentSubmissionInput,
    now: Date,
  ): Promise<PaymentPageSession> {
    const page = await this.store.run(async (tx) => {
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
    // VER-01 (Slice 5.3): staff with payments:verify are told once the ID is kept; a notice that fails changes nothing.
    if (page.method !== null) {
      await this.notifier
        .paymentToVerify({
          tenantId,
          sessionId: page.sessionId,
          orderNumber: page.orderNumber,
          method: page.method,
          amount: page.amount,
          transactionId: input.transactionId,
        })
        .catch((error: unknown) => {
          this.logger.error(`could not tell staff of a payment to verify: ${String(error)}`);
        });
    }
    return page;
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

  /** TVR-02 (agreed 2026-10-31): a shopper's report of a payment page, for Lytro; [5] an hour from one visitor. */
  report(
    tenantId: string,
    ref: string,
    input: PaymentPageReportInput,
    ip: string | null,
    now: Date,
  ): Promise<void> {
    return this.store.run(async (tx) => {
      const hourAgo = new Date(now.getTime() - HOUR_MS);
      if (
        ip !== null &&
        (await this.store.reportsFromIpSince(tx, ip, hourAgo)) >= PAGE_REPORTS_PER_VISITOR_PER_HOUR
      ) {
        throw new ApiError('rate_limited', 'TooManyReports', {}, HOUR_MS / 1000);
      }
      await this.store.insertReport(tx, {
        tenantId,
        ref,
        reason: input.reason,
        note: input.note ? input.note : null,
        ip,
      });
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
      sessionId: session.id,
      orderNumber: await this.store.orderNumberOf(tx, tenantId, session.orderId),
      amount: session.amount,
      state: stateAt(session, now),
      expiresAt: session.expiresAt,
      method: session.method,
      methods: offered ?? (await this.methods.forShoppersWithin(tx, tenantId)),
      returnUrl: session.returnUrl,
      cancelUrl: session.cancelUrl,
      rejected:
        session.state === PaymentSessionState.Failed && session.rejectReason !== null
          ? { reason: session.rejectReason, note: session.rejectNote }
          : null,
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

  /**
   * TVR-04 (Slice 5.3, agreed 2026-10-31): a new shop's online payments a day are capped -- a pay-as-you-go shop's
   * unless the operator switched it off, any other's only when switched on -- for its first [30] days. A session that
   * would take the day's verified payments and open sessions past [20,000] TK is refused.
   */
  private async refuseOverCap(
    tx: Transaction,
    tenantId: string,
    amount: string,
    now: Date,
  ): Promise<void> {
    const shop = await this.store.newShopOf(tx, tenantId);
    if (!shop || !(shop.newShopCap ?? shop.state === TenantState.PayAsYouGo)) return;
    const days = await this.figure(
      PlatformSettingKey.NewShopPaymentCapDays,
      NEW_SHOP_PAYMENT_CAP_DAYS,
    );
    if (now.getTime() - shop.createdAt.getTime() >= days * DAY_MS) return;
    const cap = await this.figure(
      PlatformSettingKey.NewShopPaymentCapAmount,
      NEW_SHOP_PAYMENT_CAP_AMOUNT,
    );
    const taken = toPaisa(await this.store.capTotal(tx, tenantId, startOfDayDhaka(now)));
    if (taken + toPaisa(amount) > BigInt(cap) * 100n) {
      throw new ApiError('conflict', 'NewShopCapReached', { reason: 'new_shop_cap' });
    }
  }

  private async figure(key: PlatformSettingKey, fallback: number): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' ? setting.value : fallback;
  }

  /** PAY-04: an address the page returns to must be on one of the key's websites. */
  private refuseAddress(address: string, websites: readonly string[], field: string): void {
    const origin = new URL(address).origin;
    if (websites.includes(origin)) return;
    throw new FieldsError([
      { field, problem: FieldProblemCode.NotAllowed, messageKey: 'ReturnAddressNotAllowed' },
    ]);
  }

  private openedOf(session: SelectPaymentSession): OpenedPayment {
    return {
      paymentUrl: this.urlOf(session.ref),
      amount: session.amount,
      expiresAt: session.expiresAt,
    };
  }

  private urlOf(ref: string): string {
    return `${this.origin}/${ref}`;
  }
}
