import { CircuitBreaker } from '../../../../common/circuit-breaker';
import type { SmsProvider, SmsSent } from '../ports/sms-provider';

/** What BulkSMSBD needs, from the server's settings. Never logged. */
export interface BulkSmsBdSettings {
  baseUrl: string;
  apiKey: string;
  senderId: string;
}

export type SmsFetch = (input: string, init: RequestInit) => Promise<Response>;

/** BulkSMSBD answered and said no: a wrong number, a disabled sender ID, its own balance used up. Not retried by the circuit. */
export class SmsRefused extends Error {
  constructor(
    readonly code: number | null,
    detail: string,
  ) {
    super(`BulkSMSBD refused the SMS (${code === null ? 'no code' : String(code)}): ${detail}`);
    this.name = 'SmsRefused';
  }
}

// BulkSMSBD's own answers, from its API page (PHASE-7-PLAN Appendix A). Others are said by their number.
const REFUSALS: Readonly<Record<number, string>> = {
  1001: 'invalid number',
  1002: 'sender ID not correct or disabled',
  1003: 'a required field is missing',
  1005: 'internal error',
  1006: 'balance validity not available',
  1007: "Lytro's BulkSMSBD balance is used up",
  1011: 'user ID not found',
  1012: 'masking SMS must be sent in Bengali',
  1031: 'account not verified',
  1032: "this server's IP address isn't on the account's allowed list",
};

const ACCEPTED = 202;
const TIMEOUT_MS = 15_000;
const CIRCUIT = 'sms:bulksmsbd';

/** BulkSMSBD wants 8801XXXXXXXXX; Lytro keeps 01XXXXXXXXX. Anything else goes as typed, for BulkSMSBD to judge. */
export function bulkSmsBdNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('01') && digits.length === 11) return `88${digits}`;
  return digits;
}

type Answer =
  { kind: 'sent'; providerMessageId: string | null } | { kind: 'refused'; error: SmsRefused };

/**
 * D7-2 (Phase 7 Slice 7.1): BulkSMSBD's SMS API, always over HTTPS. A send that gets no answer is thrown, and counts
 * against the circuit; a refusal is an answer, and doesn't. The key goes in the form body, never the address, and
 * nothing it says is logged.
 */
export class BulkSmsBdProvider implements SmsProvider {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly settings: BulkSmsBdSettings,
    private readonly fetchSms: SmsFetch,
    breaker: CircuitBreaker = new CircuitBreaker({ service: 'bulksmsbd' }),
  ) {
    if (!settings.baseUrl.startsWith('https://')) {
      throw new Error('BulkSMSBD is only called over HTTPS');
    }
    this.breaker = breaker;
  }

  async send(message: { toPhone: string; body: string }): Promise<SmsSent> {
    const answer = await this.breaker.call(CIRCUIT, () => this.post(message));
    if (answer.kind === 'refused') throw answer.error;
    return { providerMessageId: answer.providerMessageId };
  }

  private async post(message: { toPhone: string; body: string }): Promise<Answer> {
    const response = await this.fetchSms(`${this.settings.baseUrl}/smsapi`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: this.settings.apiKey,
        type: 'text',
        number: bulkSmsBdNumber(message.toPhone),
        senderid: this.settings.senderId,
        message: message.body,
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    let answer: unknown;
    try {
      answer = JSON.parse(text);
    } catch {
      throw new Error(`BulkSMSBD answered HTTP ${String(response.status)} with no JSON`);
    }
    const fields = (answer ?? {}) as { response_code?: unknown; message_id?: unknown };
    const code = typeof fields.response_code === 'number' ? fields.response_code : null;
    if (code === ACCEPTED) {
      const id = fields.message_id;
      return {
        kind: 'sent',
        providerMessageId: typeof id === 'number' || typeof id === 'string' ? String(id) : null,
      };
    }
    return {
      kind: 'refused',
      error: new SmsRefused(
        code,
        code === null ? 'no response code' : (REFUSALS[code] ?? 'unknown code'),
      ),
    };
  }
}
