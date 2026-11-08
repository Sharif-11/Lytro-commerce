import {
  renderSmsTemplate,
  SmsBlockedReason,
  SmsEvent,
  SmsLogKind,
  smsUnitsOf,
  smsWithName,
  type SmsLogEntryKind,
  type SmsVariable,
} from '@lytronix/validators';
import { appConfig } from '@/lib/app-config';

/** Each SMS's name and when it goes, in the menu dictionary (Part 37's `P37_EV`). */
export const EVENT_WORDS: Readonly<Record<SmsEvent, readonly [string, string]>> = {
  [SmsEvent.OrderPlaced]: ['p37EvPlaced', 'p37EvPlacedW'],
  [SmsEvent.PaymentVerified]: ['p37EvPaid', 'p37EvPaidW'],
  [SmsEvent.OrderShipped]: ['p37EvShipped', 'p37EvShippedW'],
  [SmsEvent.OrderDelivered]: ['p37EvDelivered', 'p37EvDeliveredW'],
  [SmsEvent.OrderCancelled]: ['p37EvCancelled', 'p37EvCancelledW'],
  [SmsEvent.NewOrderAlert]: ['p37EvNewOrder', 'p37EvNewOrderW'],
  [SmsEvent.PaymentToVerify]: ['p37EvToVerify', 'p37EvToVerifyW'],
};

/** A log row's kind, an SMS event or a code (SMS-07). */
export const LOG_KIND_WORDS: Readonly<Record<SmsLogEntryKind, string>> = {
  ...Object.fromEntries(Object.entries(EVENT_WORDS).map(([event, [name]]) => [event, name])),
  [SmsLogKind.SigninCode]: 'p37KSignin',
  [SmsLogKind.StaffResetCode]: 'p37KReset',
  [SmsLogKind.ShopperCode]: 'p37KShopper',
} as Record<SmsLogEntryKind, string>;

/** Why an SMS was blocked. */
export const BLOCKED_WORDS: Readonly<Record<SmsBlockedReason, string>> = {
  [SmsBlockedReason.InsufficientBalance]: 'p37BlBalance',
  [SmsBlockedReason.BalanceFrozen]: 'p37BlFrozen',
  [SmsBlockedReason.SpendCap]: 'p37BlCap',
};

/** Each variable's name, as the editor and its Insert chips write it (the server keeps `{order_number}` and the like). */
export const VARIABLE_WORDS: Readonly<Record<SmsVariable, string>> = {
  order_number: 'p37VarOrder',
  amount: 'p37VarAmount',
  customer_name: 'p37VarName',
  tracking_link: 'p37VarLink',
};

/** SMS-10: a template is counted with an order number and a tracking link of their real lengths (the server's own sample). */
export function sampleOf(template: string, smsName: string, slug: string): string {
  return smsWithName(
    smsName,
    renderSmsTemplate(template, {
      order_number: '261106-0017',
      amount: '1,250',
      customer_name: 'রহিম উদ্দিন',
      tracking_link: `https://${appConfig.shopHost(slug)}/track/AB3XK9QZ`,
    }),
  );
}

export function partsOf(text: string, unitSize: number): number {
  return smsUnitsOf(text, unitSize);
}

/**
 * The editor's words: each `{variable}` written as `[its name]` in the person's language, so no braces show. Turned back
 * before saving; a bracket naming nothing it knows stays as it was typed, and the server refuses an unknown variable.
 */
export function toEditor(template: string, name: (variable: SmsVariable) => string): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, variable: string) =>
    variable in VARIABLE_WORDS ? `[${name(variable as SmsVariable)}]` : whole,
  );
}

export function fromEditor(words: string, name: (variable: SmsVariable) => string): string {
  let template = words;
  for (const variable of Object.keys(VARIABLE_WORDS) as SmsVariable[]) {
    template = template.split(`[${name(variable)}]`).join(`{${variable}}`);
  }
  return template;
}
