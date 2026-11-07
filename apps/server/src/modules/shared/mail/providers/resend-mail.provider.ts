import { CircuitBreaker } from '../../../../common/circuit-breaker';
import type { MailMessage, MailProvider, MailSent } from '../ports/mail-provider';

/** What Resend needs, from the server's settings. The key is never logged. */
export interface ResendSettings {
  baseUrl: string;
  apiKey: string;
  from: string;
}

export type MailFetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Resend answered and said no: an unverified sending domain, a malformed address, a key without permission. Sending the
 * same email again would get the same answer, so it is final and not retried, and it doesn't count against the circuit.
 */
export class MailRefused extends Error {
  constructor(
    readonly status: number,
    readonly kind: string | null,
  ) {
    super(`Resend refused the email (${String(status)}${kind === null ? '' : `, ${kind}`})`);
    this.name = 'MailRefused';
  }
}

// Resend's answers that mean "this email, as it is, will never be sent" (its errors page, read for Slice 7.3). A 409
// is final only when the key was used for a different email; its other 409s, 429 and 5xx are worth trying again.
const FINAL_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 405, 422]);
const FINAL_CONFLICTS: ReadonlySet<string> = new Set(['invalid_idempotent_request']);

const TIMEOUT_MS = 15_000;
const CIRCUIT = 'mail:resend';
// Resend keeps an idempotency key 24 hours and allows 256 characters; the outbox's retries end within two hours.
const IDEMPOTENCY_KEY_MAX = 256;

type Answer = { kind: 'sent'; id: string | null } | { kind: 'refused'; error: MailRefused };

/**
 * D7-3 (Phase 7 Slice 7.3): Resend's email API, always over HTTPS. Each email carries the outbox's own key, so a retry
 * after a lost answer is never a second email. A send that gets no answer, or a server error, is thrown and counts
 * against the circuit; a refusal is an answer, and doesn't.
 */
export class ResendMailProvider implements MailProvider {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly settings: ResendSettings,
    private readonly fetchMail: MailFetch,
    breaker: CircuitBreaker = new CircuitBreaker(),
  ) {
    if (!settings.baseUrl.startsWith('https://')) {
      throw new Error('Resend is only called over HTTPS');
    }
    this.breaker = breaker;
  }

  async send(message: MailMessage): Promise<MailSent> {
    const answer = await this.breaker.call(CIRCUIT, () => this.post(message));
    if (answer.kind === 'refused') throw answer.error;
    return { providerMessageId: answer.id };
  }

  private async post(message: MailMessage): Promise<Answer> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.settings.apiKey}`,
      'content-type': 'application/json',
    };
    if (message.idempotencyKey !== undefined) {
      headers['idempotency-key'] = message.idempotencyKey.slice(0, IDEMPOTENCY_KEY_MAX);
    }
    const response = await this.fetchMail(`${this.settings.baseUrl}/emails`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: this.settings.from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const answer = await readJson(response);
    if (response.ok) {
      return { kind: 'sent', id: typeof answer?.['id'] === 'string' ? answer['id'] : null };
    }
    const kind = typeof answer?.['name'] === 'string' ? answer['name'] : null;
    if (
      FINAL_STATUSES.has(response.status) ||
      (response.status === 409 && kind !== null && FINAL_CONFLICTS.has(kind))
    ) {
      return { kind: 'refused', error: new MailRefused(response.status, kind) };
    }
    // A busy or broken Resend, or a quota that resets: thrown, so the outbox tries again later.
    throw new Error(`Resend could not take the email now (${String(response.status)})`);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await response.json();
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
