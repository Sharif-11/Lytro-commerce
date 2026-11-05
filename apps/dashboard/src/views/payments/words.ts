import { formatTaka } from '@lytronix/ui';
import {
  ListenerMessageStatus,
  PaymentListStatus,
  PaymentMethod,
  PaymentRejectReason,
  PaymentReviewReason,
  PaymentSessionSource,
  VerificationLevel,
} from '@lytronix/validators';
import type { StatusTone } from '@/components/ui/status-tag';
import { bangladeshiPhone } from '@/lib/phone';
import type { ShopPayment } from '@/types/payments';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The reasons staff choose from (PAY-14), in the order the sheet lists them. */
export const REJECT_REASONS: readonly PaymentRejectReason[] = [
  PaymentRejectReason.NoPaymentFound,
  PaymentRejectReason.TransactionIdUsed,
  PaymentRejectReason.Other,
];

const REJECT_WORD: Record<PaymentRejectReason, string> = {
  [PaymentRejectReason.NoPaymentFound]: 'spWhyNone',
  [PaymentRejectReason.TransactionIdUsed]: 'spWhyUsed',
  [PaymentRejectReason.Other]: 'spWhyOther',
};

export const rejectWord = (reason: PaymentRejectReason, t: Translate): string =>
  t(REJECT_WORD[reason]);

const STATUS: Record<PaymentListStatus, { word: string; tone: StatusTone }> = {
  [PaymentListStatus.ToVerify]: { word: 'spToVerify', tone: 'warn' },
  [PaymentListStatus.Verified]: { word: 'spVerified', tone: 'ok' },
  [PaymentListStatus.Rejected]: { word: 'spRejected', tone: 'bad' },
  [PaymentListStatus.Voided]: { word: 'spVoided', tone: 'neutral' },
  [PaymentListStatus.Refunded]: { word: 'spRefunded', tone: 'neutral' },
};

/** A row's pill: a test payment says so before anything else (VER-11). */
export function statusOf(payment: ShopPayment, t: Translate): { word: string; tone: StatusTone } {
  if (payment.test) return { word: t('spTest'), tone: 'neutral' };
  const status = STATUS[payment.status];
  return { word: t(status.word), tone: status.tone };
}

const RECEIPT: Partial<Record<ListenerMessageStatus, { word: string; tone: StatusTone }>> = {
  [ListenerMessageStatus.Matched]: { word: 'spRMatched', tone: 'ok' },
  [ListenerMessageStatus.Unmatched]: { word: 'spRUnmatched', tone: 'warn' },
  [ListenerMessageStatus.NeedsReview]: { word: 'spNeedsReview', tone: 'warn' },
};

/** A receipt's pill. The list holds only receipts that keep their ID, so nothing else is expected here. */
export function receiptStatusOf(
  status: ListenerMessageStatus,
  t: Translate,
): { word: string; tone: StatusTone } {
  const known = RECEIPT[status] ?? { word: 'spNeedsReview', tone: 'warn' as const };
  return { word: t(known.word), tone: known.tone };
}

const phone = (number: string): string => bangladeshiPhone.grouped(number);

export interface ReviewLine {
  tone: 'warn' | 'neutral';
  text: string;
}

/**
 * Why a payment waits for staff, in one line (VER-02 to VER-05, WAL-21): what the phone's SMS said against what was asked. With
 * no receipt behind it, a wallet a paired phone can read says none has come, since that is what staff need to check next.
 */
export function reviewLineOf(
  payment: ShopPayment,
  t: Translate,
  phonesPaired: boolean,
): ReviewLine | null {
  const { receipt } = payment;
  const warn = (text: string): ReviewLine => ({ tone: 'warn', text });
  switch (payment.reviewReason) {
    case PaymentReviewReason.Amount:
      return warn(
        t('spMisAmount', {
          asked: formatTaka(payment.amount),
          sms: formatTaka(receipt?.amount ?? '0'),
        }),
      );
    case PaymentReviewReason.Sender: {
      const from = receipt?.senderNumber ? phone(receipt.senderNumber) : '';
      return warn(
        payment.senderNumber
          ? t('spMisSender', { typed: phone(payment.senderNumber), sms: from })
          : t('spMisSenderSms', { sms: from }),
      );
    }
    case PaymentReviewReason.Wallet:
      return warn(t('spMisWallet'));
    case PaymentReviewReason.OldReceipt:
      return warn(t('spMisOld'));
    case PaymentReviewReason.LowBalance:
      return warn(t('spMisBalance'));
    case PaymentReviewReason.OrderClosed:
      return warn(t('spMisClosed'));
    case PaymentReviewReason.TransactionIdUsed:
      return warn(t('spMisUsed'));
    case PaymentReviewReason.ByHand:
      return {
        tone: 'neutral',
        text: t('spByHand', { sms: formatTaka(receipt?.amount ?? payment.amount) }),
      };
    // BIL-15: only a payment to Lytro closes this way, never a shop's.
    case PaymentReviewReason.RequestClosed:
      return null;
    case null:
      break;
  }
  return phonesPaired && receipt === null && payment.method === PaymentMethod.Bkash
    ? { tone: 'neutral', text: t('spNoSms') }
    : null;
}

const SOURCE: Record<PaymentSessionSource, string> = {
  [PaymentSessionSource.Checkout]: 'spFromCheckout',
  [PaymentSessionSource.StaffLink]: 'spFromLink',
};

export const sourceWord = (source: PaymentSessionSource | null, t: Translate): string =>
  t(source === null ? 'spFromStaff' : SOURCE[source]);

const LEVEL: Record<VerificationLevel, string> = {
  [VerificationLevel.Manual]: 'spHowHand',
  [VerificationLevel.Listener]: 'spHowPhone',
  [VerificationLevel.Gateway]: 'spHowGateway',
};

export const levelWord = (level: VerificationLevel, t: Translate): string => t(LEVEL[level]);

/** The amount as a field shows it: `450`, not `450.00`. */
export const amountInField = (amount: string): string => String(Number(amount));
