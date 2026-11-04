import {
  GatewayResult,
  PaymentMethod,
  PaymentMethodKind,
  PaymentPageReportReason,
  PaymentPageReviewReason,
  PaymentRejectReason,
  PaymentSessionSource,
  PaymentSessionState,
  PaymentWay,
  WalletAccountType,
} from '@lytronix/validators';
import type { ShopperPaymentMethod } from '../../src/modules/payment-methods/types/payment-methods';
import type { DrawOptions } from '../../src/modules/payment-page/page/render';
import type { PageAsk, PageData } from '../../src/modules/payment-page/page/screens';
import type { PaymentPageSession } from '../../src/modules/payment-sessions/types/payment-sessions';

// The prototype's example, so each screen can be set beside its drawing: docs/brand/lytro-payment-page.html.
export const REF = '8f2kq7x1a9z3mQ4tYv0bLw';
const TWENTY_NINE_FORTY_MS = (29 * 60 + 40) * 1000;

function wallet(
  method: ShopperPaymentMethod['method'],
  number: string,
  overrides: Partial<ShopperPaymentMethod> = {},
): ShopperPaymentMethod {
  return {
    accountId: `account-${method}`,
    method,
    kind: PaymentMethodKind.Wallet,
    way: PaymentWay.Listener,
    accountName: 'Megh Fashion',
    number,
    accountType: WalletAccountType.Personal,
    note: null,
    bank: null,
    ...overrides,
  };
}

const NOTE = {
  bn: 'টাকা পাঠানোর সময় রেফারেন্সে অর্ডার নম্বর লিখুন।',
  en: 'Put your order number as the reference when you send.',
};

const METHODS = (language: 'bn' | 'en'): ShopperPaymentMethod[] => [
  wallet(PaymentMethod.Bkash, '01712345678', { note: NOTE[language] }),
  wallet(PaymentMethod.Nagad, '01812345678', { note: NOTE[language] }),
  wallet(PaymentMethod.Rocket, '017123456789', { note: NOTE[language] }),
  wallet(PaymentMethod.Upay, '01712345678', { note: NOTE[language] }),
  wallet(PaymentMethod.Bank, '', {
    kind: PaymentMethodKind.Bank,
    number: null,
    accountType: null,
    note: NOTE[language],
    bank: {
      bankName: 'BRAC Bank',
      accountNumber: '1501204567890001',
      branch: language === 'bn' ? 'গুলশান' : 'Gulshan',
      routingNumber: '060261726',
      swiftCode: 'BRAKBDDH',
      instructions: null,
    },
  }),
];

function session(now: Date, language: 'bn' | 'en'): PaymentPageSession {
  return {
    sessionId: 'e0000000-0000-4000-8000-000000000001',
    orderNumber: '261104-0042',
    trackingId: 'K7F2M9QX',
    items: [
      {
        name: language === 'bn' ? 'কটন পাঞ্জাবি' : 'Cotton panjabi',
        attributes: ['M'],
        quantity: '1',
      },
      {
        name: language === 'bn' ? 'শিফন হিজাব' : 'Chiffon hijab',
        attributes: [language === 'bn' ? 'কালো' : 'Black'],
        quantity: '2',
      },
    ],
    source: PaymentSessionSource.Checkout,
    amount: '250.00',
    state: PaymentSessionState.AwaitingPayment,
    expiresAt: new Date(now.getTime() + TWENTY_NINE_FORTY_MS),
    method: null,
    methods: METHODS(language),
    returnUrl: 'https://megh.lytro.app/order/K7F2M9QX',
    cancelUrl: 'https://megh.lytro.app/order/K7F2M9QX?pay=cancelled',
    rejected: null,
    review: null,
    listenerOnline: true,
    idChangesLeft: 3,
    gatewayResult: null,
    test: false,
    submitted: null,
  };
}

export interface Fixture {
  session?: (now: Date) => Partial<PaymentPageSession>;
  ask?: Partial<PageAsk>;
  options?: DrawOptions;
  orderPage?: string | null;
}

function typedAt(now: Date, secondsAgo: number): PaymentPageSession['submitted'] {
  return {
    method: PaymentMethod.Bkash,
    transactionId: '9F2KQ7X1',
    senderNumber: null,
    submittedAt: new Date(now.getTime() - secondsAgo * 1000),
  };
}

const waiting = (
  state: PaymentSessionState,
  extra: Partial<PaymentPageSession> = {},
  secondsAgo = 12,
): Fixture => ({
  session: (now) => ({
    state,
    method: PaymentMethod.Bkash,
    submitted: typedAt(now, secondsAgo),
    ...extra,
  }),
});

const ONE_WALLET_AUTOMATED = (language: 'bn' | 'en'): ShopperPaymentMethod[] =>
  METHODS(language).map((row) =>
    row.method === PaymentMethod.Bkash ? { ...row, way: PaymentWay.Automated } : row,
  );

/** Every screen, by the name the prototype gives it. */
export const FIXTURES: Readonly<Record<string, Fixture>> = {
  pick: {},
  details: {},
  reported: { ask: { reported: true } },
  test: { session: () => ({ test: true }) },
  'no-methods': { session: () => ({ methods: [] }) },
  handing: {
    session: () => ({ method: PaymentMethod.Bkash, methods: ONE_WALLET_AUTOMATED('bn') }),
  },
  'gw-cancelled': {
    session: () => ({ method: PaymentMethod.Bkash, gatewayResult: GatewayResult.Cancelled }),
  },
  'gw-failed': {
    session: () => ({ method: PaymentMethod.Bkash, gatewayResult: GatewayResult.Failed }),
  },
  bkash: { ask: { wallet: PaymentMethod.Bkash } },
  'bkash-agent': {
    ask: { wallet: PaymentMethod.Bkash },
    session: () => ({
      methods: [
        wallet(PaymentMethod.Bkash, '01712345678', { accountType: WalletAccountType.Agent }),
      ],
    }),
  },
  'bkash-merchant': {
    ask: { wallet: PaymentMethod.Bkash },
    session: () => ({
      methods: [
        wallet(PaymentMethod.Bkash, '01712345678', { accountType: WalletAccountType.Merchant }),
      ],
    }),
  },
  nagad: { ask: { wallet: PaymentMethod.Nagad } },
  rocket: { ask: { wallet: PaymentMethod.Rocket } },
  upay: { ask: { wallet: PaymentMethod.Upay } },
  bank: { ask: { wallet: PaymentMethod.Bank } },
  dup: {
    ask: { wallet: PaymentMethod.Bkash },
    options: { typed: { transactionId: '9F2KQ7X1', senderNumber: '', problem: 'used' } },
  },
  bad: {
    ask: { wallet: PaymentMethod.Bkash },
    options: { typed: { transactionId: 'TX-12', senderNumber: '', problem: 'shape' } },
  },
  report: { ask: { wallet: PaymentMethod.Bkash } },
  'report-other': {
    ask: { wallet: PaymentMethod.Bkash },
    options: { typedReport: { reason: PaymentPageReportReason.Other, note: '' } },
  },
  change: { ...waiting(PaymentSessionState.Checking), ask: { change: true } },
  checking: waiting(PaymentSessionState.Checking),
  'checking-late': waiting(PaymentSessionState.Checking, {}, 45),
  manual: waiting(PaymentSessionState.Checking, { listenerOnline: false }),
  verified: { ...waiting(PaymentSessionState.Verified, { idChangesLeft: 0 }), ask: { just: true } },
  'verified-done': {
    ...waiting(PaymentSessionState.Verified, {
      idChangesLeft: 0,
      returnUrl: null,
      cancelUrl: null,
    }),
    ask: { just: true },
    orderPage: null,
  },
  review: waiting(PaymentSessionState.NeedsReview, {
    review: { reason: PaymentPageReviewReason.Amount },
  }),
  'review-sender': waiting(PaymentSessionState.NeedsReview, {
    review: { reason: PaymentPageReviewReason.Sender },
  }),
  'review-other': waiting(PaymentSessionState.NeedsReview, {
    review: { reason: PaymentPageReviewReason.Other },
  }),
  rejected: waiting(PaymentSessionState.Failed, {
    idChangesLeft: 0,
    rejected: { reason: PaymentRejectReason.NoPaymentFound, note: null },
  }),
  'rejected-note': waiting(PaymentSessionState.Failed, {
    idChangesLeft: 0,
    rejected: { reason: PaymentRejectReason.Other, note: '200 taka short' },
  }),
  expired: { session: () => ({ state: PaymentSessionState.Expired }) },
  paid: waiting(PaymentSessionState.Verified, { idChangesLeft: 0 }),
  cancelled: { session: () => ({ state: PaymentSessionState.Cancelled }) },
};

/** What the page is drawn from for a fixture, in this language, as of now. */
export function dataOf(name: string, now: Date, language: 'bn' | 'en'): PageData {
  const fixture = FIXTURES[name];
  if (!fixture) throw new Error(`no fixture named ${name}`);
  return {
    ref: REF,
    session: { ...session(now, language), ...fixture.session?.(now) },
    shop: {
      name: language === 'bn' ? 'মেঘ ফ্যাশন' : 'Megh Fashion',
      logoUrl: null,
      contactPhone: '01711223344',
    },
    orderPageUrl:
      fixture.orderPage === undefined ? 'https://megh.lytro.app/track/K7F2M9QX' : fixture.orderPage,
  };
}
