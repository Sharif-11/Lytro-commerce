import { GROWTH, ONE_MONTH, STARTER } from './catalogue';

// The shop's payments to Lytro as the prototype's Billing draws them (docs/brand/lytro-dashboard.html, Part 8): the ৳500
// top-up being checked, yesterday's paid top-up, this month's paid renewal with its invoice, September's from the
// balance and June's from the earlier shop. Dates count back from now, so the groups read as the sketch's do.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
const MONTH = { labelEn: '1 month', labelBn: '1 মাস', months: 1 };

export interface PaymentFixture {
  id: string;
  kind: string;
  state: string;
  amount: string;
  [field: string]: unknown;
}

/** A payment as GET /billing/payments lists it, everything not given empty. */
export function payment(given: PaymentFixture): PaymentFixture {
  return {
    tenantId: 'tenant-1',
    planId: given.kind === 'top_up' ? null : STARTER,
    billingTermId: given.kind === 'top_up' ? null : ONE_MONTH,
    creditAmount: '0.00',
    quotedAt: ago(HOUR),
    status: 'pending',
    senderNumber: null,
    transactionId: null,
    verifiedBy: null,
    verifiedAt: null,
    submittedAt: null,
    note: null,
    cancelReason: null,
    createdAt: ago(HOUR),
    method: null,
    planName: given.kind === 'top_up' ? null : 'Starter',
    billingTerm: given.kind === 'top_up' ? null : MONTH,
    invoice: null,
    addons: [],
    earlierShop: false,
    ...given,
  };
}

export const NOTE = {
  bn: 'SMS-এ ৳440 এসেছে, পাঠানোর কথা ৳449। পুরো টাকা পাঠিয়ে আবার জমা দিন।',
  en: 'The SMS shows ৳440; the amount was ৳449. Send the full amount and submit again.',
};

export const CHECKING_TOP_UP = payment({
  id: 'pay_7kq2mz',
  kind: 'top_up',
  state: 'checking',
  amount: '500.00',
  status: 'needs_review',
  method: 'wallet',
  transactionId: '7KQ2MZ',
  senderNumber: '+8801711000231',
  quotedAt: ago(2 * HOUR),
  submittedAt: ago(2 * HOUR - 2 * 60 * 1000),
});

export const PAID_TOP_UP = payment({
  id: 'pay_9f2kq7',
  kind: 'top_up',
  state: 'paid',
  amount: '500.00',
  status: 'verified',
  method: 'wallet',
  transactionId: '9F2KQ7',
  senderNumber: '+8801711000231',
  quotedAt: ago(DAY + HOUR),
  submittedAt: ago(DAY + HOUR),
  verifiedAt: ago(DAY),
});

export const PAID_RENEWAL = payment({
  id: 'pay_5kd9qw',
  kind: 'renewal',
  state: 'paid',
  amount: '449.00',
  status: 'verified',
  method: 'wallet',
  transactionId: '5KD9QW',
  senderNumber: '+8801711000231',
  quotedAt: ago(3 * DAY),
  submittedAt: ago(3 * DAY - 2 * 60 * 1000),
  verifiedAt: ago(3 * DAY - 20 * 60 * 1000),
  invoice: { id: 'inv-214', number: 214 },
});

const FROM_BALANCE = payment({
  id: 'pay_sep',
  kind: 'renewal',
  state: 'paid',
  amount: '449.00',
  status: 'verified',
  method: 'balance',
  quotedAt: ago(40 * DAY),
  verifiedAt: ago(40 * DAY),
  invoice: { id: 'inv-173', number: 173 },
});

const EARLIER_SHOP = payment({
  id: 'pay_jun',
  kind: 'purchase',
  state: 'paid',
  amount: '1280.00',
  status: 'verified',
  method: 'wallet',
  transactionId: '2ZK8PL',
  billingTerm: { labelEn: '3 months', labelBn: '3 মাস', months: 3 },
  quotedAt: ago(140 * DAY),
  verifiedAt: ago(140 * DAY),
  invoice: { id: 'inv-090', number: 90 },
  earlierShop: true,
});

/** The list the prototype draws, newest first. */
export function drawnPayments(): PaymentFixture[] {
  return [CHECKING_TOP_UP, PAID_TOP_UP, PAID_RENEWAL, FROM_BALANCE, EARLIER_SHOP];
}

/** The renewal support rejected, with its note, as `billing-rejected` draws it. */
export function rejectedRenewal(language: 'bn' | 'en'): PaymentFixture {
  return payment({
    id: 'pay_8m3pqr',
    kind: 'renewal',
    state: 'rejected',
    amount: '449.00',
    status: 'rejected',
    method: 'wallet',
    transactionId: '8M3PQR',
    senderNumber: '+8801711000231',
    quotedAt: ago(90 * 60 * 1000),
    submittedAt: ago(87 * 60 * 1000),
    verifiedAt: ago(40 * 60 * 1000),
    note: NOTE[language],
  });
}

/** A renewal request nothing was sent for, 3 hours old (`billing-awaiting`). */
export const AWAITING_RENEWAL = payment({
  id: 'pay_9ha3rc',
  kind: 'renewal',
  state: 'awaiting',
  amount: '449.00',
  quotedAt: ago(3 * HOUR),
});

/** A renewal request that lapsed (`billing-expired`). */
export const EXPIRED_RENEWAL = payment({
  id: 'pay_2vd6tn',
  kind: 'renewal',
  state: 'expired',
  amount: '449.00',
  status: 'expired',
  quotedAt: ago(26 * HOUR),
});

/** An upgrade being checked, for Plan's banner. */
export const CHECKING_UPGRADE = payment({
  id: 'pay_up1',
  kind: 'upgrade',
  state: 'checking',
  amount: '400.00',
  planId: GROWTH,
  planName: 'Growth',
  method: 'wallet',
  transactionId: '4UP9QX',
  submittedAt: ago(HOUR),
});

/** The invoice of the paid renewal (BIL-12). */
export function invoiceOf(id: string): unknown {
  return {
    id,
    tenantId: 'tenant-1',
    number: Number(id.replace(/\D/g, '')) || 214,
    kind: 'renewal',
    planSnapshot: {
      products: 100,
      orders_handled_monthly: 300,
      staff: 2,
      storage_mb: 2048,
      bandwidth_gb: 30,
    },
    amount: '449.00',
    creditAmount: '0.00',
    billingTermLabel: '1 month',
    shopName: 'Megh Fashion',
    ownerName: 'Rumana',
    planName: 'Starter',
    planVersion: 3,
    periodStart: ago(3 * DAY),
    periodEnd: new Date(Date.now() + 27 * DAY).toISOString(),
    discountAmount: '0.00',
    paymentMethod: 'wallet',
    paymentReference: '5KD9QW',
    planPaymentId: 'pay_5kd9qw',
    issuedAt: ago(3 * DAY),
    earlierShop: false,
    lines: [],
  };
}

/** The statement the prototype draws: today's two SMS, yesterday's top-up and an extraction charge. */
export function drawnLedger(): unknown[] {
  return [
    {
      id: 4,
      type: 'sms',
      amount: '-0.55',
      units: '1',
      rateUsed: '0.55',
      reference: null,
      balanceAfter: '412.50',
      createdAt: ago(HOUR),
    },
    {
      id: 3,
      type: 'sms',
      amount: '-1.10',
      units: '2',
      rateUsed: '0.55',
      reference: null,
      balanceAfter: '413.05',
      createdAt: ago(2 * HOUR),
    },
    {
      id: 2,
      type: 'top_up',
      amount: '500.00',
      units: null,
      rateUsed: null,
      reference: { planPaymentId: 'pay_9f2kq7' },
      balanceAfter: '414.15',
      createdAt: ago(DAY),
    },
    {
      id: 1,
      type: 'extraction',
      amount: '-1.50',
      units: '1',
      rateUsed: '1.50',
      reference: null,
      balanceAfter: '-85.85',
      createdAt: ago(DAY + 3 * HOUR),
    },
  ];
}
