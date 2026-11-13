import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  bdMobileNumber,
  CredentialUseAction,
  GATEWAY_CALL_TIMEOUT_SECONDS,
  GATEWAY_TOKEN_CALLS_PER_HOUR,
  PaymentMethod,
} from '@lytronix/validators';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';
import type {
  CredentialUseLog,
  GatewayAccount,
  GatewayCheckout,
  GatewayStanding,
  WalletGateway,
} from '../ports/wallet-gateway';
import { GatewayError } from '../ports/wallet-gateway';
import { BKASH_URLS, CREDENTIAL_USE_LOG, GATEWAY_CLOCK, GATEWAY_FETCH } from '../tokens';
import { SharedGatewayTokens } from './shared-gateway-tokens';

/** The gateway's addresses; each is the host and version, as `https://tokenized.sandbox.bka.sh/v2`. */
export interface BkashUrls {
  sandbox: string;
  production: string;
}

interface HeldToken {
  idToken: string;
  refreshToken: string;
  refreshAfter: number;
}

type Reply = Record<string, unknown>;

const FIELDS = ['appKey', 'appSecret', 'username', 'password'] as const;
// bKash: a token lasts 60 minutes; refresh between the 50th and 55th.
const REFRESH_AFTER_MS = 50 * MINUTE_MS;
// VER-09: bKash's answers meaning this payment was already executed; ask where it stands.
const ALREADY_EXECUTED: ReadonlySet<string> = new Set(['2062', '2068', '2117']);

function textOf(reply: Reply, field: string): string | null {
  const value = reply[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * WAL-19, VER-08, VER-09, SEC-09, SEC-11 (Phase 5 Slice 5.7, read agreed 2026-11-03): bKash's Tokenized Checkout, without an
 * agreement. A token is held in memory per account (SEC-09); bKash allows [2] token calls an hour and blocks the app past that,
 * so a third is refused here, not sent: the count comes from the use log, which a restart doesn't forget, and shoppers arriving
 * together share one call. Every call goes through the account's circuit breaker and is logged without its credential; none
 * of bKash's own wording reaches a shopper (SEC-16). A timed-out execute is `unknown`, for `verify` to settle, never
 * retried: a payment executes once.
 */
@Injectable()
export class BkashGateway implements WalletGateway {
  readonly method = PaymentMethod.Bkash;
  readonly credentialFields = FIELDS;

  private readonly logger = new Logger('BkashGateway');
  private readonly tokens = new Map<string, HeldToken>();
  private readonly asking = new Map<string, Promise<string>>();
  private readonly breaker = new CircuitBreaker();

  constructor(
    @Inject(BKASH_URLS) private readonly urls: BkashUrls,
    @Inject(GATEWAY_FETCH) private readonly send: typeof fetch,
    @Inject(CREDENTIAL_USE_LOG) private readonly log: CredentialUseLog,
    @Inject(GATEWAY_CLOCK) private readonly clock: () => Date,
    @Inject(SharedGatewayTokens) private readonly shared: SharedGatewayTokens,
  ) {}

  isConfigured(credentials: Readonly<Record<string, string>>): boolean {
    return FIELDS.every((field) => (credentials[field] ?? '') !== '');
  }

  forget(accountId: string): void {
    this.tokens.delete(accountId);
    void this.shared.forget(accountId);
  }

  /** WAL-13: a token for these credentials, one held still vouching for them; no payment is made. */
  async testConnection(account: GatewayAccount): Promise<void> {
    await this.tokenOf(account);
  }

  async initiate(
    account: GatewayAccount,
    payment: { amount: string; invoice: string; payerReference: string; callbackUrl: string },
  ): Promise<GatewayCheckout> {
    const reply = await this.payment(account, CredentialUseAction.Create, '/payment/create', {
      payerReference: payment.payerReference,
      callbackURL: payment.callbackUrl,
      amount: payment.amount,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: payment.invoice,
    });
    const paymentId = textOf(reply, 'paymentId');
    const redirectUrl = textOf(reply, 'bkashURL');
    if (paymentId === null || redirectUrl === null) {
      throw new GatewayError('bKash did not start the payment', textOf(reply, 'externalCode'));
    }
    return { paymentId, redirectUrl };
  }

  async execute(account: GatewayAccount, paymentId: string): Promise<GatewayStanding> {
    let reply: Reply;
    try {
      reply = await this.payment(account, CredentialUseAction.Execute, '/payment/execute', {
        paymentId,
      });
    } catch (error) {
      // bKash: a timeout is not a failure, so whoever called asks where the payment stands.
      if (error instanceof GatewayError && error.code === 'timeout') return { status: 'unknown' };
      throw error;
    }
    if (ALREADY_EXECUTED.has(textOf(reply, 'externalCode') ?? '')) return { status: 'unknown' };
    return this.standingOf(reply);
  }

  async verify(account: GatewayAccount, paymentId: string): Promise<GatewayStanding> {
    let reply: Reply;
    try {
      reply = await this.payment(account, CredentialUseAction.Query, '/query/payment', {
        paymentId,
      });
    } catch (error) {
      if (error instanceof GatewayError && error.code === 'timeout') return { status: 'unknown' };
      throw error;
    }
    const standing = this.standingOf(reply);
    return standing.status === 'open' && textOf(reply, 'verificationStatus') === 'Complete'
      ? { status: 'authorised' }
      : standing;
  }

  /**
   * VER-08: only a completed transaction with its ID and amount is money taken. One called completed that can't be read isn't
   * unpaid, so it is never let go as if it were; its ID is read under both spellings, as bKash's documents and answers have differed.
   */
  private standingOf(reply: Reply): GatewayStanding {
    if (textOf(reply, 'transactionStatus') !== 'Completed') return { status: 'open' };
    const transactionId = textOf(reply, 'trxId') ?? textOf(reply, 'trxID');
    const amount = textOf(reply, 'amount');
    if (transactionId === null || amount === null) {
      this.logger.error('bKash called a payment completed without saying its transaction');
      return { status: 'unknown' };
    }
    return {
      status: 'completed',
      transactionId: transactionId.toUpperCase(),
      amount,
      payerNumber: bdMobileNumber(textOf(reply, 'payerAccount') ?? ''),
    };
  }

  private async payment(
    account: GatewayAccount,
    action: CredentialUseAction,
    path: string,
    body: Reply,
  ): Promise<Reply> {
    const token = await this.tokenOf(account);
    return this.logged(account, action, () =>
      this.post(account, `/tokenized-checkout${path}`, body, {
        authorization: token,
        'x-app-key': account.credentials['appKey'] ?? '',
      }),
    );
  }

  /** SEC-09: the account's token, grown old only to be refreshed; one for every process (§107, Slice 9.4). */
  private tokenOf(account: GatewayAccount): Promise<string> {
    const held = this.tokens.get(account.accountId);
    const now = this.clock();
    if (held && now.getTime() < held.refreshAfter) return Promise.resolve(held.idToken);
    const running = this.asking.get(account.accountId);
    if (running) return running;
    const asking = this.sharedToken(account, held, now).finally(() => {
      this.asking.delete(account.accountId);
    });
    this.asking.set(account.accountId, asking);
    return asking;
  }

  /**
   * §107 (Slice 9.4): the token every process shares, from Redis; else this process's turn to ask bKash, one process at a
   * time, checking Redis again first in case another just asked. The hourly count is read inside the turn, so it's exact
   * across processes. When the turn never comes, the token this process has serves while bKash still takes it.
   */
  private async sharedToken(
    account: GatewayAccount,
    held: HeldToken | undefined,
    now: Date,
  ): Promise<string> {
    const kept = await this.shared.get(account);
    if (kept && now.getTime() < kept.refreshAfter) {
      this.tokens.set(account.accountId, kept);
      return kept.idToken;
    }
    const turn = await this.shared.inTurn(account.accountId, async () => {
      const again = await this.shared.get(account);
      if (again && this.clock().getTime() < again.refreshAfter) {
        this.tokens.set(account.accountId, again);
        return again.idToken;
      }
      const idToken = await this.askForToken(account, again ?? kept ?? held, now);
      const fresh = this.tokens.get(account.accountId);
      if (fresh) await this.shared.put(account, fresh, now);
      return idToken;
    });
    if (turn.held) return turn.value;
    const known = held ?? kept;
    if (known) return known.idToken;
    throw new GatewayError('another process is asking bKash for the token', 'token_busy');
  }

  /** bKash blocks an app for an hour past [2] token calls, so the third isn't made. */
  private async askForToken(
    account: GatewayAccount,
    held: HeldToken | undefined,
    now: Date,
  ): Promise<string> {
    const since = new Date(now.getTime() - HOUR_MS);
    const used = await this.log.tokenCallsSince(account.tenantId, account.accountId, since);
    if (used >= GATEWAY_TOKEN_CALLS_PER_HOUR) {
      // Still inside its hour, the old token serves until bKash allows another.
      if (held) return held.idToken;
      throw new GatewayError('bKash allows two token calls an hour', 'token_limit');
    }
    const auth = {
      username: account.credentials['username'] ?? '',
      password: account.credentials['password'] ?? '',
    };
    const keys = {
      app_key: account.credentials['appKey'] ?? '',
      app_secret: account.credentials['appSecret'] ?? '',
    };
    const reply = await this.logged(account, CredentialUseAction.Token, () =>
      held
        ? this.post(
            account,
            '/tokenized-checkout/auth/refresh-token',
            { ...keys, refresh_token: held.refreshToken },
            auth,
          )
        : this.post(account, '/tokenized-checkout/auth/grant-token', keys, auth),
    );
    const idToken = textOf(reply, 'id_token');
    const refreshToken = textOf(reply, 'refresh_token');
    if (textOf(reply, 'statusCode') !== '0000' || idToken === null || refreshToken === null) {
      this.tokens.delete(account.accountId);
      throw new GatewayError('bKash refused the credentials', textOf(reply, 'statusCode'));
    }
    this.tokens.set(account.accountId, {
      idToken,
      refreshToken,
      refreshAfter: now.getTime() + REFRESH_AFTER_MS,
    });
    return idToken;
  }

  /** SEC-11: a use of the credential, logged whether it worked or not; the log failing changes nothing. */
  private async logged<T>(
    account: GatewayAccount,
    action: CredentialUseAction,
    work: () => Promise<T & Reply>,
  ): Promise<T & Reply> {
    let succeeded = false;
    try {
      const reply = await this.breaker.call(`bkash:${account.accountId}`, work);
      const status = textOf(reply, 'statusCode');
      succeeded = textOf(reply, 'externalCode') === null && (status === null || status === '0000');
      return reply;
    } finally {
      await this.log
        .record({
          tenantId: account.tenantId,
          method: this.method,
          action,
          accountId: account.accountId,
          sessionId: account.sessionId,
          succeeded,
          at: this.clock(),
        })
        .catch((error: unknown) => {
          const name = error instanceof Error ? error.name : 'Error';
          this.logger.error(`could not log a credential's use: ${name}`);
        });
    }
  }

  /** A POST with a [30]-second limit. Only the gateway's own codes leave here, never a credential or its raw text. */
  private async post(
    account: GatewayAccount,
    path: string,
    body: Reply,
    headers: Record<string, string>,
  ): Promise<Reply> {
    const base = account.sandbox ? this.urls.sandbox : this.urls.production;
    let response: Response;
    try {
      response = await this.send(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GATEWAY_CALL_TIMEOUT_SECONDS * 1000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new GatewayError('bKash could not be reached', timedOut ? 'timeout' : 'unreachable');
    }
    const reply = (await response.json().catch(() => null)) as Reply | null;
    if (reply === null || typeof reply !== 'object') {
      throw new GatewayError('bKash gave no readable answer', String(response.status));
    }
    return reply;
  }
}
