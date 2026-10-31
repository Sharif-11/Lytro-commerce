import type {
  AccountMethod,
  PaymentMethodKind,
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
}

/** WAL-05, WAL-18: one method, whether it is on, how it can be verified, and its accounts in the shop's order. */
export interface PaymentMethodView {
  method: AccountMethod;
  kind: PaymentMethodKind;
  enabled: boolean;
  levels: VerificationLevel[];
  accounts: PaymentAccountView[];
}

/** The shop's payment methods, and whether its owner's phone is verified, which the payment page needs (TVR-01). */
export interface PaymentMethodsView {
  methods: PaymentMethodView[];
  ownerPhoneVerified: boolean;
}

/** WAL-06: what a shopper sees of a method that is on -- its active account only. */
export interface ShopperPaymentMethod {
  method: AccountMethod;
  kind: PaymentMethodKind;
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
