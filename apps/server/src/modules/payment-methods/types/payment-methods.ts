import type {
  AccountMethod,
  PaymentMethodKind,
  PaymentWay,
  VerificationLevel,
  WalletAccountType,
} from '@lytronix/validators';

/** WAL-01, WAL-14: one of the shop's accounts as the owner and staff see it. */
export interface PaymentAccountView {
  id: string;
  accountName: string;
  number: string | null;
  accountType: WalletAccountType | null;
  note: string | null;
  bankName: string | null;
  accountNumber: string | null;
  branch: string | null;
  routingNumber: string | null;
  swiftCode: string | null;
  instructions: string | null;
  active: boolean;
  /** WAL-09, WAL-10, WAL-12 (Slice 5.7): never the credentials themselves. */
  hasCredentials: boolean;
  credentialsUnreadable: boolean;
  sandbox: boolean;
  automated: boolean;
}

/** WAL-05, WAL-18: one method, whether it is on, how it can be verified, and its accounts in the shop's order. */
export interface PaymentMethodView {
  method: AccountMethod;
  kind: PaymentMethodKind;
  enabled: boolean;
  levels: VerificationLevel[];
  /** PAY-06 (amended 2026-11-03): how the owner takes this method's money, and the ways it supports. */
  way: PaymentWay;
  ways: PaymentWay[];
  accounts: PaymentAccountView[];
}

/** The shop's payment methods, and whether its owner's phone is verified, which the payment page needs (TVR-01). */
export interface PaymentMethodsView {
  methods: PaymentMethodView[];
  ownerPhoneVerified: boolean;
}

/** WAL-06: what a shopper sees of a method that is on -- its active account only. */
export interface ShopperPaymentMethod {
  /** Kept with a payment as the account paid into (PAY-05); never shown, as the replies' schemas leave it out. */
  accountId: string;
  method: AccountMethod;
  kind: PaymentMethodKind;
  /** PAY-06: whether picking it goes to the wallet's own checkout. */
  way: PaymentWay;
  accountName: string;
  number: string | null;
  accountType: WalletAccountType | null;
  note: string | null;
  bank: {
    bankName: string;
    accountNumber: string;
    branch: string | null;
    routingNumber: string | null;
    swiftCode: string | null;
    instructions: string | null;
  } | null;
}
