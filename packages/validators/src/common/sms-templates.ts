import { SmsEvent } from '../db/enums';

/** SMS-10, SMS-19: what a template may name, written `{name}`, filled in as each SMS is sent. */
export const SMS_VARIABLES = ['order_number', 'amount', 'tracking_link', 'customer_name'] as const;
export type SmsVariable = (typeof SMS_VARIABLES)[number];

/** SMS-10: every event's template keeps this one, so each SMS says which order it is about. */
export const SMS_REQUIRED_VARIABLE: SmsVariable = 'order_number';

/** SMS-10: the longest template a shop may save, about five units at the default unit size. */
export const SMS_TEMPLATE_MAX_LENGTH = 300;

/** Who an SMS event goes to (Slice 7.2's read): the order's shopper, or the owner's own phone. */
export type SmsRecipient = 'shopper' | 'owner';

export interface SmsEventDefinition {
  recipient: SmsRecipient;
  /** SMS-03: whether a new shop has it on. */
  on: boolean;
  /** SMS-19, I18N-03: the default words, in Bangla. The shop's name is put in front as it is sent (SMS-16). */
  template: string;
  /** SMS-10: the variables this event can fill in. */
  variables: readonly SmsVariable[];
}

/**
 * SMS-01, SMS-03, SMS-19 (Slice 7.2, read agreed 2026-11-06): the shop's SMS events, their defaults worded to the
 * owner's style guide. Each fits one 67-character unit with a typical shop name, except shipped, whose link makes it
 * two whatever link it is.
 */
export const SMS_EVENTS: Readonly<Record<SmsEvent, SmsEventDefinition>> = {
  [SmsEvent.OrderPlaced]: {
    recipient: 'shopper',
    on: true,
    template: 'অর্ডার {order_number} পেয়েছি, মোট ৳{amount}। ধন্যবাদ!',
    variables: ['order_number', 'amount', 'customer_name'],
  },
  [SmsEvent.PaymentVerified]: {
    recipient: 'shopper',
    on: true,
    template: 'অর্ডার {order_number}-এর ৳{amount} পেমেন্ট পেয়েছি।',
    variables: ['order_number', 'amount', 'customer_name'],
  },
  [SmsEvent.OrderShipped]: {
    recipient: 'shopper',
    on: true,
    template: 'অর্ডার {order_number} পাঠানো হয়েছে: {tracking_link}',
    variables: ['order_number', 'tracking_link', 'customer_name'],
  },
  [SmsEvent.OrderDelivered]: {
    recipient: 'shopper',
    on: false,
    template: 'অর্ডার {order_number} ডেলিভারি হয়েছে। ধন্যবাদ!',
    variables: ['order_number', 'customer_name'],
  },
  [SmsEvent.OrderCancelled]: {
    recipient: 'shopper',
    on: true,
    template: 'অর্ডার {order_number} ক্যানসেল করা হয়েছে।',
    variables: ['order_number', 'customer_name'],
  },
  [SmsEvent.NewOrderAlert]: {
    recipient: 'owner',
    on: false,
    template: 'নতুন অর্ডার {order_number}, মোট ৳{amount}।',
    variables: ['order_number', 'amount', 'customer_name'],
  },
  [SmsEvent.PaymentToVerify]: {
    recipient: 'owner',
    on: false,
    template: 'অর্ডার {order_number}-এর ৳{amount} পেমেন্ট ভেরিফাই করুন।',
    variables: ['order_number', 'amount'],
  },
};

const VARIABLE = /\{([^{}\s]*)\}/g;

/** SMS-10: every `{name}` a template names, known or not, in order. */
export function smsVariablesIn(template: string): string[] {
  return Array.from(template.matchAll(VARIABLE), (match) => match[1] ?? '');
}

/**
 * SMS-10: a template with its variables filled in. One with nothing to fill (a shipped order with no link anywhere)
 * leaves no gap or hanging colon behind.
 */
export function renderSmsTemplate(
  template: string,
  values: Readonly<Partial<Record<SmsVariable, string>>>,
): string {
  return template
    .replace(VARIABLE, (whole, name: string) =>
      (SMS_VARIABLES as readonly string[]).includes(name)
        ? (values[name as SmsVariable] ?? '')
        : whole,
    )
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*$/, '')
    .trim();
}

/** SMS-16: the shop's SMS name put in front, as every shop SMS begins. */
export function smsWithName(name: string, body: string): string {
  return `${name}: ${body}`;
}

/**
 * SMS-09, D7-13: an SMS's units, its characters over the unit size, whatever the language. The one count the server
 * charges by and a screen shows as the owner types (SMS-10).
 */
export function smsUnitsOf(text: string, unitSize: number): number {
  return Math.max(1, Math.ceil(Array.from(text).length / unitSize));
}
