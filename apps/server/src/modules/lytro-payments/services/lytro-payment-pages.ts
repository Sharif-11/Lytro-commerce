import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  LYTRO_PAYMENT_PAGE_MINUTES,
  PAYMENT_ID_CHANGES_MAX,
  PaymentMethod,
  PaymentMethodKind,
  PaymentRejectReason,
  PaymentSessionSource,
  PaymentSessionState,
  PaymentWay,
  PlanPaymentKind,
  PlanPaymentPageFrom,
  PlanPaymentStatus,
  ServerFieldProblemCode,
  type PaymentIdChangeInput,
  type PaymentSubmissionInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { MINUTE_MS } from '../../../common/time';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { ListenerDevices } from '../../listener/services/listener-devices';
import { LytroReceipts } from '../../lytro-receipts/services/lytro-receipts';
import type { PageData } from '../../payment-page/page/screens';
import type { PageLanguage } from '../../payment-page/page/words';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import { pageReviewOf } from '../../payment-sessions/services/payment-sessions';
import { PAYMENT_PAGE_ORIGIN } from '../../payment-sessions/tokens';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { LytroPaymentMethods } from './lytro-payment-methods';

const REF_BYTES = 16;

const DECIDABLE: readonly PaymentSessionState[] = [
  PaymentSessionState.Checking,
  PaymentSessionState.NeedsReview,
];

/** The state the page draws, from the row Billing and the operator's queue read. */
export function pageStateOf(payment: PlanPaymentRecord, now: Date): PaymentSessionState {
  switch (payment.status) {
    case PlanPaymentStatus.Verified:
      return PaymentSessionState.Verified;
    case PlanPaymentStatus.Rejected:
    case PlanPaymentStatus.Reversed:
      return PaymentSessionState.Failed;
    case PlanPaymentStatus.Expired:
      return PaymentSessionState.Expired;
    case PlanPaymentStatus.Cancelled:
      return PaymentSessionState.Cancelled;
    case PlanPaymentStatus.NeedsReview:
      return PaymentSessionState.NeedsReview;
    case PlanPaymentStatus.Pending:
      if (payment.transactionId !== null) return PaymentSessionState.Checking;
      return payment.pageExpiresAt !== null && payment.pageExpiresAt <= now
        ? PaymentSessionState.Expired
        : PaymentSessionState.AwaitingPayment;
  }
}

/** Whether a page's payment still takes a transaction ID or a checkout. */
export function pageIsOpen(payment: PlanPaymentRecord, now: Date): boolean {
  return pageStateOf(payment, now) === PaymentSessionState.AwaitingPayment;
}

function alreadyUsed(): FieldsError {
  return new FieldsError(
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

/**
 * PAYMENT-PAGE-DESIGN §8, PAY-21 (2026-11-09, the owner's read, reversing D5-3's amendment): a shop paying Lytro on the payment page.
 * `control.plan_payments` stays the record; this reads a row as the page's session and takes what the shop types there. What it
 * typed meets the receipts from Lytro's own phone as it always did, and nothing else changes for the operator's queue.
 */
@Injectable()
export class LytroPaymentPages {
  constructor(
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(LytroPaymentMethods) private readonly methods: LytroPaymentMethods,
    @Inject(LytroReceipts) private readonly receipts: LytroReceipts,
    @Inject(ListenerDevices) private readonly phones: ListenerDevices,
    @Inject(PAYMENT_PAGE_ORIGIN) private readonly pageOrigin: string,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The page for a payment nothing was sent for yet. A page still open is opened again, so a second tap or a reload lands on the same
   * one; a lapsed page starts a new window, as reopening a payment from Billing does.
   */
  async open(
    tenantId: string,
    paymentId: string,
    from: PlanPaymentPageFrom,
    kinds: readonly PlanPaymentKind[],
    now: Date,
  ): Promise<{ url: string }> {
    const ref = await this.payments.run(async (tx) => {
      const payment = await this.payments.findForUpdate(tx, paymentId);
      if (!payment || payment.tenantId !== tenantId || !kinds.includes(payment.kind)) {
        throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      }
      if (payment.status !== PlanPaymentStatus.Pending || payment.transactionId !== null) {
        throw new ApiError('conflict', 'PlanPaymentNotPending', {});
      }
      if (payment.pageRef !== null && pageIsOpen(payment, now)) {
        await this.payments.setPageWithin(tx, payment.id, { pageFrom: from });
        return payment.pageRef;
      }
      const opened = randomBytes(REF_BYTES).toString('base64url');
      await this.payments.setPageWithin(tx, payment.id, {
        pageRef: opened,
        pageExpiresAt: new Date(now.getTime() + LYTRO_PAYMENT_PAGE_MINUTES * MINUTE_MS),
        pageFrom: from,
        payMethod: null,
        gatewayPaymentId: null,
        gatewayUrl: null,
        gatewayResult: null,
        test: false,
      });
      return opened;
    });
    return { url: `${this.pageOrigin}/${ref}` };
  }

  /** The shop a page's address belongs to; null when no payment has that address. */
  async tenantOfRef(ref: string): Promise<string | null> {
    return (await this.payments.findByPageRef(ref))?.tenantId ?? null;
  }

  /** PAYMENT-PAGE-DESIGN §8: what the page draws from. */
  async dataOf(
    shop: { slug: string },
    ref: string,
    language: PageLanguage,
    now: Date,
  ): Promise<PageData> {
    const payment = await this.found(ref);
    const [label, methods] = await Promise.all([
      this.labelOf(payment, language),
      this.methods.offered(),
    ]);
    const session: PaymentPageSession = {
      sessionId: payment.id,
      trackingId: '',
      items: [],
      orderNumber: label,
      source: PaymentSessionSource.Checkout,
      amount: payment.amount,
      state: pageStateOf(payment, now),
      expiresAt: payment.pageExpiresAt ?? now,
      method: payment.payMethod,
      methods,
      returnUrl: this.returnUrlOf(payment, shop.slug),
      cancelUrl: null,
      rejected:
        payment.status === PlanPaymentStatus.Rejected
          ? { reason: PaymentRejectReason.Other, note: payment.note }
          : null,
      review:
        payment.status === PlanPaymentStatus.NeedsReview
          ? { reason: pageReviewOf(payment.reviewReason) }
          : null,
      listenerOnline: await this.listenerOnline(payment.payMethod),
      idChangesLeft: DECIDABLE.includes(pageStateOf(payment, now))
        ? Math.max(PAYMENT_ID_CHANGES_MAX - payment.idChanges, 0)
        : 0,
      gatewayResult: payment.gatewayResult,
      test: payment.test,
      submitted:
        payment.transactionId !== null && payment.submittedAt !== null
          ? {
              method: payment.payMethod ?? methods[0]?.method ?? PaymentMethod.Bkash,
              transactionId: payment.transactionId,
              senderNumber: payment.senderNumber,
              submittedAt: payment.submittedAt,
            }
          : null,
    };
    return {
      ref,
      session,
      shop: { name: 'Lytro', logoUrl: null, contactPhone: this.env.LYTRO_SUPPORT_PHONE ?? null },
      orderPageUrl: null,
      payee: 'lytro',
    };
  }

  /** PAY-07, PAY-16, and the sender number Lytro's phone checks. */
  async submit(ref: string, input: PaymentSubmissionInput, now: Date): Promise<void> {
    const offered = await this.methods.offered();
    const method = offered.find((row) => row.method === input.method);
    if (!method) throw new ApiError('conflict', 'PaymentMethodNotOffered', {});
    const typed = await this.payments.run(async (tx) => {
      const payment = await this.lock(tx, ref);
      if (!pageIsOpen(payment, now)) throw new ApiError('conflict', 'PaymentClosed', {});
      if (await this.payments.transactionIdUsedWithin(tx, input.transactionId)) throw alreadyUsed();
      await this.payments.recordSubmission(
        tx,
        payment.id,
        {
          transactionId: input.transactionId,
          senderNumber: input.senderNumber ?? null,
          matchesQuoted: true,
        },
        now,
      );
      await this.payments.setPageWithin(tx, payment.id, { payMethod: input.method });
      return payment.id;
    });
    await this.receipts.afterSubmit(await this.payments.find(typed), now);
  }

  /** PAY-07 (agreed 2026-11-02): the ID corrected, until someone has decided. */
  async change(ref: string, input: PaymentIdChangeInput, now: Date): Promise<void> {
    const typed = await this.payments.run(async (tx) => {
      const payment = await this.lock(tx, ref);
      if (!DECIDABLE.includes(pageStateOf(payment, now))) {
        throw new ApiError('conflict', 'PaymentClosed', {});
      }
      if (payment.idChanges >= PAYMENT_ID_CHANGES_MAX) {
        throw new ApiError('conflict', 'PaymentClosed', {});
      }
      if (await this.payments.transactionIdUsedWithin(tx, input.transactionId)) throw alreadyUsed();
      await this.payments.changeTypedWithin(tx, payment.id, {
        transactionId: input.transactionId,
        senderNumber: input.senderNumber ?? payment.senderNumber,
        submittedAt: now,
      });
      return payment.id;
    });
    await this.receipts.afterSubmit(await this.payments.find(typed), now);
  }

  /** Whether a method's payment needs the number it was sent from: a wallet's does, Lytro's phone reading it; a bank's has none. */
  async needsSender(method: PaymentMethod | null): Promise<boolean> {
    const offered = await this.methods.offered();
    return offered.find((row) => row.method === method)?.kind !== PaymentMethodKind.Bank;
  }

  private async found(ref: string): Promise<PlanPaymentRecord> {
    const payment = await this.payments.findByPageRef(ref);
    if (!payment) throw new ApiError('not_found', 'PaymentNotFound', {});
    return payment;
  }

  private async lock(tx: Transaction, ref: string): Promise<PlanPaymentRecord> {
    const payment = await this.payments.lockByPageRefWithin(tx, ref);
    if (!payment) throw new ApiError('not_found', 'PaymentNotFound', {});
    return payment;
  }

  /** VER-07: Lytro's phones can confirm this payment: its way is the listener, or automatic paid by hand, with a phone online. */
  private async listenerOnline(method: PaymentMethod | null): Promise<boolean> {
    const row: ShopperPaymentMethod | undefined = (await this.methods.offered()).find(
      (each) => each.method === method,
    );
    if (!row || row.way === PaymentWay.Manual) return false;
    const { devices } = await this.phones.listForLytro();
    return devices.some((device) => device.online);
  }

  private returnUrlOf(payment: PlanPaymentRecord, slug: string): string | null {
    const origin =
      this.env.DASHBOARD_ORIGIN ??
      (this.env.NODE_ENV === 'production' ? `https://app.${this.env.PLATFORM_DOMAIN}` : null);
    if (origin === null) return null;
    const from = payment.pageFrom ?? PlanPaymentPageFrom.Billing;
    return from === PlanPaymentPageFrom.Checkout
      ? `${origin}/checkout`
      : `${origin}/${slug}/${from}`;
  }

  private async labelOf(payment: PlanPaymentRecord, language: PageLanguage): Promise<string> {
    const bn = language === 'bn';
    if (payment.kind === PlanPaymentKind.TopUp) return bn ? 'টপ-আপ' : 'Top-up';
    if (payment.kind === PlanPaymentKind.Addon) return bn ? 'অ্যাড-অন' : 'Add-on';
    const label = await this.payments.pageLabelOf(payment.id);
    const plan = label?.planName ?? '';
    const term = (bn ? label?.termBn : label?.termEn) ?? '';
    const named = [plan, term].filter((part) => part !== '').join(' · ');
    if (payment.kind === PlanPaymentKind.Upgrade) {
      return bn ? `${plan}-এ আপগ্রেড` : `Upgrade to ${plan}`;
    }
    if (payment.kind === PlanPaymentKind.Renewal) {
      return `${named} · ${bn ? 'রিনিউ' : 'renewal'}`;
    }
    return named;
  }
}
