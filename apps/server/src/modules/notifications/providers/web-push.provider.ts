import webpush from 'web-push';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import type {
  PushMessage,
  PushOptions,
  PushOutcome,
  PushProvider,
  PushTarget,
} from '../ports/push-provider';

/** Lytro's VAPID keys and the address push services may write to, from the server's settings. Never logged. */
export interface VapidSettings {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export type PushFetch = (input: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 10_000;
const SENT: ReadonlySet<number> = new Set([200, 201, 202]);
const GONE: ReadonlySet<number> = new Set([404, 410]);
const REFUSED: ReadonlySet<number> = new Set([400, 403, 413]);

/**
 * NTF-02, D7-22 (Phase 7 Slice 7.3): Web Push, signed with Lytro's VAPID keys and encrypted for the browser (aes128gcm),
 * through the `web-push` library's request builder; the request itself goes through the server's own fetch and the
 * circuit breaker, keyed by the push service, so one service that is down never slows the others. Only the push
 * services' addresses reach here: subscriptions are checked against them when taken.
 */
export class WebPushProvider implements PushProvider {
  readonly publicKey: string;
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly vapid: VapidSettings,
    private readonly fetchPush: PushFetch,
    breaker: CircuitBreaker = new CircuitBreaker(),
  ) {
    this.publicKey = vapid.publicKey;
    this.breaker = breaker;
  }

  async send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushOutcome> {
    const request = webpush.generateRequestDetails(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      {
        vapidDetails: {
          subject: this.vapid.subject,
          publicKey: this.vapid.publicKey,
          privateKey: this.vapid.privateKey,
        },
        TTL: options.ttlSeconds,
        urgency: options.urgency,
        contentEncoding: 'aes128gcm',
      },
    );
    // web-push gives TTL as a number, whatever its types say; a header is always sent as a string.
    const given: Record<string, unknown> = request.headers;
    const headers = Object.fromEntries(
      Object.entries(given).map(([name, value]) => [name, String(value)]),
    );
    const circuit = `push:${new URL(target.endpoint).hostname}`;
    return this.breaker.call(circuit, async () => {
      const response = await this.fetchPush(request.endpoint, {
        method: request.method,
        headers,
        body: request.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (SENT.has(response.status)) return 'sent';
      if (GONE.has(response.status)) return 'gone';
      if (REFUSED.has(response.status)) return 'refused';
      throw new Error(`the push service could not take the push now (${String(response.status)})`);
    });
  }
}
