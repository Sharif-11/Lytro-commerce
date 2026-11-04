import type {
  AccountMethod,
  PaymentMethodKind,
  PaymentWay,
  VerificationLevel,
  WalletAccountType,
} from '@lytronix/validators';

/** Mirrors `PaymentAccountView` in apps/server/src/modules/payment-methods/types/payment-methods.ts (WAL-01, WAL-14). */
export interface PaymentAccount {
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
  /** WAL-09, WAL-12: never the keys themselves. */
  hasCredentials: boolean;
  credentialsUnreadable: boolean;
  sandbox: boolean;
  automated: boolean;
}

/** One method: whether it is on, how its money is taken and the ways it can be, and its accounts in the shop's order. */
export interface PaymentMethodRow {
  method: AccountMethod;
  kind: PaymentMethodKind;
  enabled: boolean;
  levels: VerificationLevel[];
  way: PaymentWay;
  ways: PaymentWay[];
  accounts: PaymentAccount[];
}

export interface PaymentMethodsView {
  methods: PaymentMethodRow[];
  ownerPhoneVerified: boolean;
}

/** WAL-13: what a test of the connection found: the gateway's refusal as a code, never its words. */
export interface GatewayTest {
  ok: boolean;
  code: string | null;
}
