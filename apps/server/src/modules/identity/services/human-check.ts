import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { CircuitBreaker, CircuitOpen } from '../../../common/circuit-breaker';
import { SECOND_MS } from '../../../common/time';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { OutsideCalls } from '../../shared/outside-calls/services/outside-calls';
import { STRICT_ADDRESS_LIMITS } from '../address-limits';
import { TURNSTILE_FETCH } from '../tokens';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// A person is waiting on the code form: a slow answer is no answer.
export const SITEVERIFY_TIMEOUT_MS = 5 * SECOND_MS;

/** What a code request is for, as the dashboard's widget names it (apps/dashboard/src/lib/turnstile.ts). */
export type HumanCheckAction = 'signin' | 'reset';

/**
 * How the check went. `off`: the server has no widget secret. `refused`: no token, or Cloudflare didn't pass it for
 * this page and request. `unreachable`: Cloudflare couldn't say (down, slow, its circuit open, or our secret wrong).
 */
export type HumanCheckResult = 'off' | 'passed' | 'refused' | 'unreachable';

/**
 * SMS-11: who asked for a code -- the client address when the server can trust it (D14), and, when lower than the
 * usual, the cap on that address's code SMS an hour for this one request.
 */
export interface CodeAsker {
  ip: string | null;
  ipCap?: number;
}

interface SiteverifyAnswer {
  success?: unknown;
  'error-codes'?: unknown;
  hostname?: unknown;
  action?: unknown;
  metadata?: { result_with_testing_key?: unknown } | null;
}

// Siteverify's answers that are ours to fix, not the visitor's. The request goes on as if Cloudflare were unreachable,
// and the failure counts against the circuit, so the operators are emailed when it opens.
const OUR_FAULTS = new Set(['missing-input-secret', 'invalid-input-secret', 'internal-error']);

/** Siteverify answered, but not with a verdict on the token. Its message is a status or Cloudflare's own codes. */
class SiteverifyFault extends Error {
  constructor(readonly reason: string) {
    super(`siteverify: ${reason}`);
    this.name = 'SiteverifyFault';
  }
}

function errorCodesOf(answer: SiteverifyAnswer): string[] {
  const codes = answer['error-codes'];
  return Array.isArray(codes)
    ? codes.filter((code): code is string => typeof code === 'string')
    : [];
}

/** Why Cloudflare couldn't say, in words that never carry the secret, the token or the address. */
function reasonOf(error: unknown): string {
  if (error instanceof CircuitOpen) return 'circuit open';
  if (error instanceof SiteverifyFault) return error.reason;
  if (error instanceof Error && error.name === 'TimeoutError') return 'timed out';
  return 'unreachable';
}

/**
 * SUP-08, SMS-11, AUTH-09 as amended 2026-11-20 (the owner's "Raise them + bot check"): every dashboard request that
 * texts a code -- sign-up and sign-in by code, a reset and its resend -- carries the token of the dashboard's
 * Cloudflare Turnstile widget, and this asks Cloudflare's Siteverify whether it came from a person, on this page, for
 * this request.
 * The owner's rule for an outage: while Cloudflare can't say, the request goes on under the strict per-address limit
 * (STRICT_ADDRESS_LIMITS), not refused. Calls go through the shared breaker; the log says only the request, the
 * outcome and Cloudflare's codes -- never the secret, the token or the address.
 */
@Injectable()
export class HumanCheck {
  private readonly logger = new Logger('Turnstile');
  private readonly breaker: CircuitBreaker;
  private readonly secret: string | undefined;
  private readonly hostnames: ReadonlySet<string>;

  constructor(
    @Inject(ENV) env: Pick<Env, 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_HOSTNAMES' | 'PLATFORM_DOMAIN'>,
    @Inject(TURNSTILE_FETCH) private readonly send: typeof fetch,
    // PRF-04, PRF-05 (Slice 9.5): the shared breaker, timed and alerting.
    @Optional() @Inject(OutsideCalls) outside?: OutsideCalls,
  ) {
    this.secret = env.TURNSTILE_SECRET_KEY;
    this.hostnames = new Set(
      env.TURNSTILE_HOSTNAMES.length > 0 ? env.TURNSTILE_HOSTNAMES : [`app.${env.PLATFORM_DOMAIN}`],
    );
    this.breaker = outside?.breaker('turnstile') ?? new CircuitBreaker({ service: 'turnstile' });
  }

  /** Whether code requests are checked at all (the widget's secret is set). */
  get on(): boolean {
    return this.secret !== undefined;
  }

  /** Who a code request goes on as, or a refusal (`HumanCheckFailed`) when its token isn't a person's. */
  async askerFor(
    token: string | undefined,
    action: HumanCheckAction,
    ip: string | null,
  ): Promise<CodeAsker> {
    const result = await this.check(token, action, ip);
    if (result === 'refused') throw new ApiError('forbidden', 'HumanCheckFailed');
    if (result === 'unreachable') return { ip, ipCap: STRICT_ADDRESS_LIMITS.codeSmsPerHour };
    return { ip };
  }

  /**
   * Who a code SMS the bot check doesn't cover goes on as: a signed-in owner adding a phone (AUTH-26). While the check
   * is on, the per-address limits are the raised ones, so this keeps the strict cap: an account opened by a free email
   * code mustn't text phones at the raised rate with no token behind it.
   */
  uncheckedAsker(ip: string | null): CodeAsker {
    return this.on ? { ip, ipCap: STRICT_ADDRESS_LIMITS.codeSmsPerHour } : { ip };
  }

  async check(
    token: string | undefined,
    action: HumanCheckAction,
    ip: string | null,
  ): Promise<HumanCheckResult> {
    const secret = this.secret;
    if (secret === undefined) return 'off';
    if (token === undefined || token === '') {
      this.logger.log(`turnstile ${action}: refused (no token)`);
      return 'refused';
    }
    let answer: SiteverifyAnswer;
    try {
      answer = await this.breaker.call('siteverify', () => this.ask(secret, token, ip));
    } catch (error) {
      this.logger.warn(
        `turnstile ${action}: Cloudflare couldn't say (${reasonOf(error)}); the strict per-address limit applies`,
      );
      return 'unreachable';
    }
    if (answer.success !== true) {
      this.logger.log(
        `turnstile ${action}: refused (${errorCodesOf(answer).join(' ') || 'not passed'})`,
      );
      return 'refused';
    }
    // Cloudflare's test secrets pass any page with no action (config/turnstile.ts); production never has one.
    const testing = answer.metadata?.result_with_testing_key === true;
    if (!testing && answer.action !== action) {
      this.logger.log(`turnstile ${action}: refused (another request's token)`);
      return 'refused';
    }
    if (!testing && (typeof answer.hostname !== 'string' || !this.hostnames.has(answer.hostname))) {
      this.logger.log(`turnstile ${action}: refused (another page's token)`);
      return 'refused';
    }
    return 'passed';
  }

  private async ask(secret: string, token: string, ip: string | null): Promise<SiteverifyAnswer> {
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== null) body.set('remoteip', ip);
    const response = await this.send(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    // A wrong secret is a 400 with its code in the body; anything 5xx is Cloudflare's own trouble.
    if (response.status >= 500) throw new SiteverifyFault(`HTTP ${String(response.status)}`);
    let answer: unknown;
    try {
      answer = await response.json();
    } catch {
      throw new SiteverifyFault(`HTTP ${String(response.status)}, no JSON`);
    }
    if (typeof answer !== 'object' || answer === null)
      throw new SiteverifyFault(`HTTP ${String(response.status)}, no answer`);
    const fault = errorCodesOf(answer).find((code) => OUR_FAULTS.has(code));
    if (fault !== undefined) throw new SiteverifyFault(fault);
    return answer;
  }
}
