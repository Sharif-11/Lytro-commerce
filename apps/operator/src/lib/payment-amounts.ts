import type { TFunction } from 'i18next';
import type { QueuedPayment } from '@/types/operator';
import { taka } from './format';

/** The money a queued payment stands for: what a receipt says arrived, else what was quoted, never the seller's say-so. */
export function amountOf(payment: QueuedPayment): string {
  return payment.amountArrived ?? payment.amount;
}

export function differsFromQuote(payment: QueuedPayment): boolean {
  return Number(amountOf(payment)) !== Number(payment.amount);
}

/** Why a payment needs a person, in words: the two amounts when they differ, else the reason the matcher gave. */
export function reviewLine(payment: QueuedPayment, t: TFunction): string {
  if (differsFromQuote(payment)) {
    return t('queue.reviewWhy', { q: taka(payment.amount), s: taka(amountOf(payment)) });
  }
  return payment.reviewReason ? t(`reviewReasons.${payment.reviewReason}`) : '';
}
