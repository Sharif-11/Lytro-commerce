import {
  COURIER_NAMES,
  MailSuppressionReason,
  MediaKind,
  NOTICE_LINK_PREFIX,
  OrderSource,
  ParcelAttention,
  ParcelReading,
  PAYMENT_METHOD_NAMES,
  type CourierKey,
  type PaymentMethod,
} from '@lytronix/validators';
import type { Bilingual, MailWords } from '../../common/i18n/bilingual';

/** A notification's title and body, in both languages (NTF-03: fixed platform copy, the variables filled in). */
export type NotificationText = Bilingual<{ title: string; body: string }>;

/** An email's words as a notification's: its subject is the title. */
export function fromMailWords(words: MailWords): NotificationText {
  return {
    bn: { title: words.bn.subject, body: words.bn.body },
    en: { title: words.en.subject, body: words.en.body },
  };
}

/**
 * Where a notification leads in the dashboard, within the shop: the dashboard puts the shop's slug in front, and a push
 * carries it whole. The courier screens' paths are Slice 6.7's (PR #321).
 */
export const NOTIFICATION_LINKS = {
  order: (orderId: string): string => `/orders/${orderId}`,
  product: (productId: string): string => `/products/${productId}`,
  payments: '/payments',
  paymentMethods: '/settings/payment-methods',
  couriers: '/settings/couriers',
  courier: (courierKey: string): string => `/settings/couriers/${courierKey}`,
  listener: '/settings/listener',
  billing: '/billing',
  invoices: '/invoices',
  addons: '/addons',
  activity: '/activity',
  usage: '/usage',
  balance: '/balance',
  account: '/account',
  // NTC-06 (Slice 7.4): a notice from Lytro, on the shop's board.
  notice: (noticeId: string): string => `${NOTICE_LINK_PREFIX}${noticeId}`,
} as const;

const SOURCES: Readonly<Record<OrderSource, Bilingual<string>>> = {
  [OrderSource.Storefront]: { bn: 'স্টোরফ্রন্ট', en: 'storefront' },
  [OrderSource.LandingPage]: { bn: 'ল্যান্ডিং পেজ', en: 'landing page' },
  [OrderSource.Api]: { bn: 'API', en: 'API' },
  [OrderSource.Dashboard]: { bn: 'ড্যাশবোর্ড', en: 'dashboard' },
};

/** ORD-20: an order from outside the shop. */
export function orderPlacedText(input: {
  orderNumber: string;
  customerName: string | null;
  grandTotal: string;
  source: OrderSource;
}): NotificationText {
  const source = SOURCES[input.source];
  return {
    bn: {
      title: `নতুন অর্ডার ${input.orderNumber}`,
      body: `${input.customerName ?? 'একজন কাস্টমার'} · ৳${input.grandTotal} · ${source.bn}`,
    },
    en: {
      title: `New order ${input.orderNumber}`,
      body: `${input.customerName ?? 'A customer'} · ${input.grandTotal} TK · ${source.en}`,
    },
  };
}

/** VER-01: a payment staff check by hand. */
export function paymentToVerifyText(input: {
  orderNumber: string;
  method: PaymentMethod;
  amount: string;
  transactionId: string;
}): NotificationText {
  const method = PAYMENT_METHOD_NAMES[input.method];
  return {
    bn: {
      title: `পেমেন্ট ভেরিফাই করুন: অর্ডার ${input.orderNumber}`,
      body: `${method.bn}-এ ৳${input.amount}, TrxID ${input.transactionId}। মিলিয়ে দেখে অ্যাপ্রুভ করুন।`,
    },
    en: {
      title: `Payment to verify: order ${input.orderNumber}`,
      body: `${input.amount} TK by ${method.en}, TrxID ${input.transactionId}. Check it and approve.`,
    },
  };
}

/** VER-01, D5-4: a payment verified by itself, by the listener or the gateway. */
export function paymentVerifiedText(input: {
  orderNumber: string;
  amount: string;
  transactionId: string;
}): NotificationText {
  return {
    bn: {
      title: `পেমেন্ট ভেরিফাই হয়েছে: অর্ডার ${input.orderNumber}`,
      body: `৳${input.amount} পাওয়া গেছে, TrxID ${input.transactionId}।`,
    },
    en: {
      title: `Payment verified: order ${input.orderNumber}`,
      body: `${input.amount} TK received, TrxID ${input.transactionId}.`,
    },
  };
}

/** PAY-14: money arrived for an order that is closed, to be refunded. */
export function moneyForClosedOrderText(input: {
  orderNumber: string;
  amount: string;
  transactionId: string;
}): NotificationText {
  return {
    bn: {
      title: `বন্ধ অর্ডারে টাকা এসেছে: ${input.orderNumber}`,
      body:
        `অর্ডার ${input.orderNumber} বন্ধ, তবু ৳${input.amount} এসেছে (TrxID ${input.transactionId})। ` +
        'কাস্টমারের সাথে কথা বলে রিফান্ড করুন।',
    },
    en: {
      title: `Money for a closed order: ${input.orderNumber}`,
      body:
        `Order ${input.orderNumber} is closed, but ${input.amount} TK arrived for it (TrxID ${input.transactionId}). ` +
        'Talk to the customer and refund it.',
    },
  };
}

/** WAL-24: a wallet's automated gateway stopped working. */
export function gatewayAttentionText(method: PaymentMethod): NotificationText {
  const name = PAYMENT_METHOD_NAMES[method];
  return {
    bn: {
      title: `${name.bn} গেটওয়েতে সমস্যা`,
      body: `${name.bn}-এর অটোমেটেড পেমেন্ট কাজ করছে না। পেমেন্ট মেথড সেটিংস চেক করুন।`,
    },
    en: {
      title: `The ${name.en} gateway needs attention`,
      body: `Automated ${name.en} payments aren't working. Check the payment method's settings.`,
    },
  };
}

const ATTENTION: Readonly<Record<ParcelAttention, Bilingual<string>>> = {
  [ParcelAttention.CashDiffers]: {
    bn: 'কুরিয়ার যে টাকা কালেক্ট করেছে বলছে, তা COD-এর সাথে মিলছে না',
    en: 'the cash the courier reports differs from the COD',
  },
  [ParcelAttention.CodChanged]: {
    bn: 'কুরিয়ার COD-এর টাকা বদলেছে',
    en: 'the courier changed the COD amount',
  },
  [ParcelAttention.ReportAfterDelivered]: {
    bn: 'ডেলিভারির পরে কুরিয়ার নতুন খবর দিয়েছে',
    en: 'the courier sent news after it was delivered',
  },
  [ParcelAttention.DeliveredAfterCancel]: {
    bn: 'ক্যানসেল করার পরে কুরিয়ার ডেলিভারি হয়েছে বলছে',
    en: 'the courier says it was delivered after it was cancelled',
  },
};

/** CRR-13: a parcel the courier's news makes staff look at. */
export function parcelAttentionText(input: {
  orderNumber: string;
  courierKey: CourierKey;
  why: ParcelAttention;
}): NotificationText {
  const courier = COURIER_NAMES[input.courierKey];
  const why = ATTENTION[input.why];
  return {
    bn: { title: `পার্সেল চেক করুন: অর্ডার ${input.orderNumber}`, body: `${courier}: ${why.bn}।` },
    en: { title: `Check the parcel: order ${input.orderNumber}`, body: `${courier}: ${why.en}.` },
  };
}

const READINGS: Readonly<Record<ParcelReading, Bilingual<string>>> = {
  [ParcelReading.Booked]: { bn: 'বুক হয়েছে', en: 'booked' },
  [ParcelReading.WithCourier]: { bn: 'কুরিয়ারের কাছে', en: 'with the courier' },
  [ParcelReading.Unconfirmed]: { bn: 'ডেলিভারি নিশ্চিত নয়', en: 'not confirmed yet' },
  [ParcelReading.Hold]: { bn: 'হোল্ডে আছে', en: 'on hold' },
  [ParcelReading.Delivered]: { bn: 'ডেলিভারি হয়েছে', en: 'delivered' },
  [ParcelReading.PartlyDelivered]: { bn: 'আংশিক ডেলিভারি হয়েছে', en: 'partly delivered' },
  [ParcelReading.Returning]: { bn: 'ফেরত আসছে', en: 'on its way back' },
  [ParcelReading.Problem]: { bn: 'সমস্যা হয়েছে', en: 'has a problem' },
};

/** CRR-12: the courier's news moved a parcel. */
export function parcelMovedText(input: {
  orderNumber: string;
  courierKey: CourierKey;
  reading: ParcelReading;
}): NotificationText {
  const courier = COURIER_NAMES[input.courierKey];
  const reading = READINGS[input.reading];
  return {
    bn: { title: `অর্ডার ${input.orderNumber}: ${reading.bn}`, body: `${courier} থেকে খবর।` },
    en: { title: `Order ${input.orderNumber}: ${reading.en}`, body: `News from ${courier}.` },
  };
}

/** CRR-15, CRR-27: a courier connection that needs the owner. */
export function courierConnectionText(
  courierKey: CourierKey,
  trouble: 'login_refused' | 'paste_broken' | 'token_missing',
): NotificationText {
  const courier = COURIER_NAMES[courierKey];
  const bodies: Record<typeof trouble, Bilingual<string>> = {
    login_refused: {
      bn: `${courier} আপনার লগইন নিচ্ছে না। কুরিয়ার সেটিংসে কী আবার দিন।`,
      en: `${courier} refuses your login. Enter the keys again in courier settings.`,
    },
    paste_broken: {
      bn: `${courier}-এর খবর মেসেজে আসছে না। কুরিয়ার সেটিংসে মেসেজের ঠিকানা আবার পেস্ট করুন।`,
      en: `${courier}'s news isn't arriving by message. Paste the message address again in courier settings.`,
    },
    token_missing: {
      bn: `${courier}-এর মেসেজ সিগনেচার ছাড়া আসছে। কুরিয়ার সেটিংসে টোকেনটিও পেস্ট করুন।`,
      en: `${courier}'s messages arrive without a signature. Paste the token too in courier settings.`,
    },
  };
  return {
    bn: { title: `${courier} কানেকশনে সমস্যা`, body: bodies[trouble].bn },
    en: { title: `${courier} connection needs a look`, body: bodies[trouble].en },
  };
}

/** CRR-23: Lytro is retiring a courier, with the one suggested in its place and where the default moved. */
export function courierRetiringText(input: {
  courierKey: CourierKey;
  suggestedKey: CourierKey;
  defaultMovedTo: CourierKey | null;
}): NotificationText {
  const courier = COURIER_NAMES[input.courierKey];
  const suggested = COURIER_NAMES[input.suggestedKey];
  const moved = input.defaultMovedTo === null ? null : COURIER_NAMES[input.defaultMovedTo];
  return {
    bn: {
      // D8-78 (the owner, 2026-11-11, for couriers too): রিটায়ার হচ্ছে, as a retiring payment method and the courier chip say it.
      title: `${courier} রিটায়ার হচ্ছে`,
      body:
        `Lytro ${courier} রিটায়ার করছে। বুক করা পার্সেল আগের মতোই চলবে। নতুন বুকিংয়ের জন্য ${suggested} কানেক্ট করুন।` +
        (moved === null ? '' : ` আপনার ডিফল্ট কুরিয়ার এখন ${moved}।`),
    },
    en: {
      title: `${courier} is being retired`,
      body:
        `Lytro is retiring ${courier}. Parcels already booked carry on as before. Connect ${suggested} for new ` +
        `bookings.${moved === null ? '' : ` Your default courier is now ${moved}.`}`,
    },
  };
}

/** CRR-24: a retired courier is back. */
export function courierBackText(courierKey: CourierKey): NotificationText {
  const courier = COURIER_NAMES[courierKey];
  return {
    bn: {
      title: `${courier} আবার চালু`,
      body: `Lytro ${courier} আবার চালু করেছে। চাইলে আবার কানেক্ট করতে পারবেন।`,
    },
    en: {
      title: `${courier} is back`,
      body: `Lytro has brought ${courier} back. You can connect it again.`,
    },
  };
}

/**
 * WAL-18, D8-66 (Slice 8.7): Lytro is retiring a payment method type the shop set up. It keeps working until it is removed, and
 * removing it takes the shop's accounts for it, so the owner is asked to have another way to be paid ready.
 */
export function paymentMethodRetiringText(method: PaymentMethod): NotificationText {
  const name = PAYMENT_METHOD_NAMES[method];
  return {
    bn: {
      // D8-78 (the owner's word, 2026-11-10): রিটায়ার হচ্ছে, as the chip, the activity log and the switches say it.
      title: `${name.bn} রিটায়ার হচ্ছে`,
      body:
        `Lytro ${name.bn} রিটায়ার করছে। আপাতত আগের মতোই চলবে, চেকআউটেও। পরে এটি রিমুভ হলে এর অ্যাকাউন্টগুলোও চলে যাবে, ` +
        `তাই কাস্টমারদের জন্য অন্য একটি পেমেন্ট মেথড চালু রাখুন।`,
    },
    en: {
      title: `${name.en} is being retired`,
      body:
        `Lytro is retiring ${name.en}. It keeps working for now, checkout included. When it is removed, its accounts go ` +
        `with it, so keep another payment method on for your customers.`,
    },
  };
}

/** WAL-18 (Slice 8.7): a payment method type Lytro was retiring is back. */
export function paymentMethodBackText(method: PaymentMethod): NotificationText {
  const name = PAYMENT_METHOD_NAMES[method];
  return {
    bn: {
      title: `${name.bn} আবার চালু`,
      body: `Lytro ${name.bn} আবার চালু করেছে। আগের মতোই ব্যবহার করতে পারবেন।`,
    },
    en: {
      title: `${name.en} is back`,
      body: `Lytro has brought ${name.en} back. You can use it as before.`,
    },
  };
}

/** INV-08: a variant's stock fell to its threshold. */
export function lowStockText(input: {
  productName: string;
  available: string;
  threshold: string;
}): NotificationText {
  return {
    bn: {
      title: `স্টক কম: ${input.productName}`,
      body: `মাত্র ${input.available}টি বাকি (অ্যালার্ট ${input.threshold}-এ)।`,
    },
    en: {
      title: `Low stock: ${input.productName}`,
      body: `Only ${input.available} left (alert at ${input.threshold}).`,
    },
  };
}

/** INV-13: a batch expires within 30 days. */
export function batchExpiringText(input: {
  productName: string;
  batchCode: string | null;
  quantity: string;
  expiresOn: string;
}): NotificationText {
  const bnBatch = input.batchCode === null ? 'একটি ব্যাচের' : `ব্যাচ ${input.batchCode}-এর`;
  const enBatch = input.batchCode === null ? 'A batch' : `Batch ${input.batchCode}`;
  return {
    bn: {
      title: `মেয়াদ শেষ হচ্ছে: ${input.productName}`,
      body: `${bnBatch} ${input.quantity}টির মেয়াদ ${input.expiresOn}-এ শেষ হবে।`,
    },
    en: {
      title: `Expiring soon: ${input.productName}`,
      body: `${enBatch}: ${input.quantity} expire on ${input.expiresOn}.`,
    },
  };
}

/** INV-13: stock held for orders has expired. */
export function heldStockExpiredText(input: {
  productName: string;
  reserved: string;
  short: string;
}): NotificationText {
  return {
    bn: {
      title: `অর্ডারে রাখা স্টকের মেয়াদ শেষ: ${input.productName}`,
      body: `অর্ডারের জন্য রাখা ${input.reserved}টির মধ্যে ${input.short}টির মেয়াদ শেষ হয়ে গেছে।`,
    },
    en: {
      title: `Held stock expired: ${input.productName}`,
      body: `${input.short} of the ${input.reserved} held for orders have expired.`,
    },
  };
}

/** STO-09: an upload that couldn't be used. */
export function mediaFailedText(kind: MediaKind): NotificationText {
  const video = kind === MediaKind.Video;
  return {
    bn: {
      title: 'আপলোড নেওয়া যায়নি',
      body: `একটি ${video ? 'ভিডিও' : 'ছবি'} আপলোড ব্যবহার করা যায়নি। অন্য ফাইল দিয়ে আবার ট্রাই করুন।`,
    },
    en: {
      title: 'An upload was refused',
      body: `A ${video ? 'video' : 'photo'} upload couldn't be used. Try again with another file.`,
    },
  };
}

/** LSN-12, LSN-14, LSN-21: the shop's own listener phone, revoked or sending too much. */
export function listenerPhoneText(
  name: string,
  what: 'auto_revoked' | 'revoked_by_lytro' | 'volume_flagged',
): NotificationText {
  if (what === 'auto_revoked') {
    return {
      bn: {
        title: `লিসেনার ফোন রিভোক হয়েছে: ${name}`,
        body: 'অন্য একটি অ্যাপ ইনস্টলেশন থেকে বারবার কল আসায় ফোনটি নিজে থেকে রিভোক হয়েছে। চেক করে আবার পেয়ার করুন।',
      },
      en: {
        title: `Listener phone revoked: ${name}`,
        body: 'It was revoked on its own after calls from another app installation. Check it, then pair it again.',
      },
    };
  }
  if (what === 'revoked_by_lytro') {
    return {
      bn: {
        title: `Lytro আপনার লিসেনার ফোন রিভোক করেছে: ${name}`,
        body: 'কারণ জানতে Lytro সাপোর্টের সাথে যোগাযোগ করুন।',
      },
      en: {
        title: `Lytro revoked your listener phone: ${name}`,
        body: 'Contact Lytro support to find out why.',
      },
    };
  }
  return {
    bn: {
      title: `লিসেনার ফোন অনেক বেশি পাঠাচ্ছে: ${name}`,
      body: 'ফোনটি থেকে স্বাভাবিকের চেয়ে অনেক বেশি ওয়ালেট মেসেজ আসছে। ফোনটি চেক করুন।',
    },
    en: {
      title: `Listener phone sending too much: ${name}`,
      body: 'More wallet messages are arriving from it than a phone should send. Check the phone.',
    },
  };
}

/** NTF-06, D7-38: Lytro stopped emailing the owner's address. */
export function emailBouncedText(email: string, reason: MailSuppressionReason): NotificationText {
  const complained = reason === MailSuppressionReason.Complained;
  return {
    bn: {
      title: 'আপনার ইমেইলে মেইল পৌঁছাচ্ছে না',
      body: complained
        ? `${email}-এ Lytro-এর ইমেইল স্প্যাম হিসেবে মার্ক করা হয়েছে, তাই Lytro এখন আর ইমেইল পাঠাচ্ছে না। অ্যাকাউন্ট থেকে ইমেইল ঠিক করুন।`
        : `${email}-এ পাঠানো ইমেইল ফেরত আসছে, তাই Lytro এখন আর এই ঠিকানায় ইমেইল পাঠাচ্ছে না। অ্যাকাউন্ট থেকে ইমেইল ঠিক করুন।`,
    },
    en: {
      title: "Email to you isn't arriving",
      body: complained
        ? `Lytro's email to ${email} was marked as spam, so Lytro has stopped emailing it. Fix your email in your account.`
        : `Email sent to ${email} is bouncing, so Lytro has stopped emailing it. Fix your email in your account.`,
    },
  };
}

/** NTF-02: the test a person sends themselves. */
export const PUSH_TEST_TEXT: NotificationText = {
  bn: { title: 'Lytro পুশ টেস্ট', body: 'এই ডিভাইসে নোটিফিকেশন আসছে।' },
  en: { title: 'Lytro push test', body: 'Notifications reach this device.' },
};
