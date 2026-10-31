import { PaymentMethod, PaymentMethodKind, VerificationLevel } from '../db/enums';

/**
 * WAL-18: a payment method type -- its kind, which decides the account's fields (a wallet's number and account type,
 * or a bank's details, WAL-14), the lengths a wallet number may have, and the verification levels it supports.
 */
export interface PaymentMethodType {
  kind: PaymentMethodKind;
  numberLengths: readonly number[];
  levels: readonly VerificationLevel[];
}

const WALLET = { kind: PaymentMethodKind.Wallet, numberLengths: [11] } as const;

/**
 * WAL-18 (Phase 5 Slice 5.1, D5-6): the methods a shop takes money by into its own accounts -- bKash, Nagad, Rocket and
 * Upay (wallets) and bank transfer -- keyed as order payments are (ORD-15), so a payment and its account agree. Rocket's
 * numbers may carry a twelfth, check digit. Every type is verified by hand; a level is added to a type when its slice
 * builds it (the listener for bKash, Slice 5.4; bKash's gateway, Slice 5.7); a bank stays manual (WAL-16). Adding a type
 * of an existing kind is one row here.
 */
export const PAYMENT_METHOD_TYPES = {
  [PaymentMethod.Bkash]: { ...WALLET, levels: [VerificationLevel.Manual] },
  [PaymentMethod.Nagad]: { ...WALLET, levels: [VerificationLevel.Manual] },
  [PaymentMethod.Rocket]: {
    ...WALLET,
    numberLengths: [11, 12],
    levels: [VerificationLevel.Manual],
  },
  [PaymentMethod.Upay]: { ...WALLET, levels: [VerificationLevel.Manual] },
  [PaymentMethod.Bank]: {
    kind: PaymentMethodKind.Bank,
    numberLengths: [],
    levels: [VerificationLevel.Manual],
  },
} as const satisfies Partial<Record<PaymentMethod, PaymentMethodType>>;

/** A method a shop keeps accounts for (never cash or cash on delivery). */
export type AccountMethod = Extract<PaymentMethod, keyof typeof PAYMENT_METHOD_TYPES>;

export function isAccountMethod(value: string): value is AccountMethod {
  return Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_TYPES, value);
}

/** The methods, in the order they are shown -- the payment methods' own order. */
export const ACCOUNT_METHODS: readonly AccountMethod[] =
  Object.values(PaymentMethod).filter(isAccountMethod);
