import type { CredentialUseAction, PaymentMethod } from '@lytronix/validators';

/** ADM-10: stands where a shop's ID goes on a call with Lytro's own keys, which belong to no shop. */
export const LYTRO_GATEWAY_OWNER = 'lytro';

/** WAL-09, WAL-11: the account a call runs on, its credentials opened only for the call (SEC-09). */
export interface GatewayAccount {
  tenantId: string;
  accountId: string;
  sandbox: boolean;
  credentials: Readonly<Record<string, string>>;
  /** SEC-11: the payment the call serves, for the log; null for a test of the connection. */
  sessionId: string | null;
}

/** PAY-06: a checkout started at the wallet: its reference, and where the shopper goes. */
export interface GatewayCheckout {
  paymentId: string;
  redirectUrl: string;
}

/**
 * VER-08, VER-09: where a payment stands at the gateway. `completed` is money taken. `authorised` means the shopper
 * confirmed and it can still be executed. `open` is nothing taken: abandoned, cancelled or failed. `unknown` means the call
 * got no answer, so it must be asked again, never retried blindly.
 */
export type GatewayStanding =
  | { status: 'completed'; transactionId: string; amount: string; payerNumber: string | null }
  | { status: 'authorised' }
  | { status: 'open' }
  | { status: 'unknown' };

/** VER-10: a gateway's refusal, in words safe to log; what the shopper sees is the page's own (SEC-16). */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * WAL-19 (Phase 5 Slice 5.7): an automated gateway for a wallet, registered by its method, as courier adapters are, with its
 * own credential fields. Adding one changes nothing for shops on the wallet's other ways.
 */
export interface WalletGateway {
  readonly method: PaymentMethod;
  readonly credentialFields: readonly string[];
  isConfigured(credentials: Readonly<Record<string, string>>): boolean;
  /** WAL-13: checks the credentials without creating a payment. */
  testConnection(account: GatewayAccount): Promise<void>;
  initiate(
    account: GatewayAccount,
    payment: { amount: string; invoice: string; payerReference: string; callbackUrl: string },
  ): Promise<GatewayCheckout>;
  /** VER-08: takes the money; one attempt per payment. */
  execute(account: GatewayAccount, paymentId: string): Promise<GatewayStanding>;
  /** VER-08: asks where the payment stands, changing nothing. */
  verify(account: GatewayAccount, paymentId: string): Promise<GatewayStanding>;
  /** WAL-09: forget anything held in memory for this account, whose credentials changed. */
  forget(accountId: string): void;
}

/** SEC-11: one use of a stored credential, without the credential. */
export interface CredentialUse {
  tenantId: string;
  method: PaymentMethod;
  action: CredentialUseAction;
  accountId: string;
  sessionId: string | null;
  succeeded: boolean;
  at: Date;
}

export interface CredentialUseLog {
  record(use: CredentialUse): Promise<void>;
  /** How many times this account asked for a token since then, worked or not. */
  tokenCallsSince(tenantId: string, accountId: string, since: Date): Promise<number>;
}
