import type { AccountMethod, PaymentMethodKind, PaymentWay } from '@lytronix/validators';

/** ADM-10: Lytro's own checkout for a method, never its keys. */
export interface LytroGatewayView {
  connected: boolean;
  /** The keys are saved but no longer open, so they must be entered again. */
  unreadable: boolean;
  sandbox: boolean;
  number: string | null;
}

/** OPERATOR-CONSOLE-DESIGN §10: one method shops may pay Lytro by. */
export interface LytroPaymentMethodView {
  method: AccountMethod;
  kind: PaymentMethodKind;
  enabled: boolean;
  way: PaymentWay;
  ways: PaymentWay[];
  /** Null where the method has no checkout. */
  gateway: LytroGatewayView | null;
}

export interface LytroBankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
  routingNumber: string | null;
  swiftCode: string | null;
  instructions: string | null;
  enabled: boolean;
  displayOrder: number;
  createdAt: Date;
}

export interface LytroPaymentMethodsView {
  methods: LytroPaymentMethodView[];
  bankAccounts: LytroBankAccount[];
}

/** WAL-13: what a test of the connection found: bKash's code, never its words. */
export interface LytroGatewayTest {
  ok: boolean;
  code: string | null;
}
