import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// OBS-08: the scripted order-and-payment check; scripts/order-payment-check.ts runs it. See there for its settings.

export interface CheckSettings {
  api: string;
  host?: string | undefined;
  key: string;
  origin: string;
  variantId: string;
  locationId: number;
  phone: string;
  method: string;
}

export interface CheckAnswer {
  status: number;
  body: unknown;
}

/** One HTTP call, as the check makes it. */
export type CheckSend = (
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  body?: unknown,
) => Promise<CheckAnswer>;

export interface CheckStep {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface CheckResult {
  ok: boolean;
  steps: CheckStep[];
}

class StepFailed extends Error {}

/** OBS-08: the check itself, with the HTTP call injected, so a test can run it against a server it starts. */
export class OrderPaymentCheck {
  constructor(
    private readonly settings: CheckSettings,
    private readonly send: CheckSend,
  ) {}

  async run(): Promise<CheckResult> {
    const steps: CheckStep[] = [];
    const step = async <T>(name: string, work: () => Promise<{ value: T; detail: string }>) => {
      const started = Date.now();
      try {
        const { value, detail } = await work();
        steps.push({ name, ok: true, ms: Date.now() - started, detail });
        return value;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        steps.push({ name, ok: false, ms: Date.now() - started, detail });
        throw new StepFailed(detail);
      }
    };
    try {
      const placed = await step('place an order needing an advance', async () => {
        const answer = await this.call('POST', '/v1/orders', this.keyHeaders(), {
          customerName: 'Lytro check',
          phone: this.settings.phone,
          locationId: this.settings.locationId,
          deliveryAddress: 'Order placed by the scripted check (OBS-08)',
          items: [{ variantId: this.settings.variantId, quantity: 1 }],
          payment: { method: this.settings.method, returnUrl: `${this.settings.origin}/thanks` },
        });
        expectStatus(answer, 201);
        const body = answer.body as {
          trackingId?: string;
          payment?: { paymentUrl?: string } | null;
        };
        const ref = /\/([A-Za-z0-9_-]{22})$/.exec(body.payment?.paymentUrl ?? '')?.[1];
        if (!body.trackingId || !ref) throw new Error('the order came back with no payment page');
        return {
          value: { trackingId: body.trackingId, ref },
          detail: `tracking ${body.trackingId}`,
        };
      });
      const way = await step('open its payment page', async () => {
        const answer = await this.call('GET', `/v1/pay/${placed.ref}`, this.pageHeaders());
        expectStatus(answer, 200);
        const body = answer.body as {
          state?: string;
          methods?: { method: string; way?: string }[];
        };
        if (body.state !== 'awaiting_payment') throw new Error(`the page is ${String(body.state)}`);
        const offered = body.methods?.find((row) => row.method === this.settings.method);
        if (!offered) throw new Error(`the page offers no ${this.settings.method}`);
        return {
          value: offered.way ?? 'listener',
          detail: `${this.settings.method} by ${offered.way ?? 'listener'}`,
        };
      });
      if (way === 'automated') {
        await step("go on to the wallet's checkout", async () => {
          const answer = await this.call(
            'POST',
            `/v1/pay/${placed.ref}/checkout`,
            this.pageHeaders(),
            {
              method: this.settings.method,
            },
          );
          expectStatus(answer, 200);
          const url = (answer.body as { redirectUrl?: string | null }).redirectUrl;
          if (!url?.startsWith('https://')) throw new Error('the wallet gave no checkout address');
          return { value: url, detail: new URL(url).host };
        });
      }
      await step('read its tracking', async () => {
        const answer = await this.call('GET', `/v1/track/${placed.trackingId}`, this.keyHeaders());
        expectStatus(answer, 200);
        const status = (answer.body as { status?: string }).status;
        if (status !== 'unverified') throw new Error(`tracking says ${String(status)}`);
        return { value: status, detail: status };
      });
      return { ok: true, steps };
    } catch (error) {
      if (error instanceof StepFailed) return { ok: false, steps };
      throw error;
    }
  }

  private keyHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.settings.key}`,
      origin: this.settings.origin,
      'idempotency-key': randomUUID(),
    };
  }

  private pageHeaders(): Record<string, string> {
    return {};
  }

  private call(
    method: 'GET' | 'POST',
    path: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<CheckAnswer> {
    const host: Record<string, string> = this.settings.host ? { host: this.settings.host } : {};
    return this.send(
      method,
      `${this.settings.api.replace(/\/$/, '')}${path}`,
      { ...host, ...headers },
      body,
    );
  }
}

function expectStatus(answer: CheckAnswer, status: number): void {
  if (answer.status === status) return;
  const error = (answer.body as { error?: { code?: string } } | null)?.error?.code;
  throw new Error(`answered ${String(answer.status)}${error ? ` ${error}` : ''}`);
}

/** The server's envelope, as its body: the data, or the error's code. */
function unwrapped(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object' || !('success' in parsed)) return parsed;
  const envelope = parsed as { success: boolean; data?: unknown; errors?: { code?: string } };
  return envelope.success ? envelope.data : { error: { code: envelope.errors?.code } };
}

/** The check's HTTP call over node's own client, which, unlike fetch, may send a Host of its own. */
export const nodeSend: CheckSend = (method, url, headers, body) => {
  const target = new URL(url);
  const data = body === undefined ? '' : JSON.stringify(body);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      target,
      {
        method,
        headers: {
          ...headers,
          ...(body === undefined
            ? {}
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }),
        },
        timeout: 15_000,
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            // Not JSON: kept as text, for the step to say what came back.
          }
          resolve({ status: res.statusCode ?? 0, body: unwrapped(parsed) });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('no answer within 15 seconds')));
    req.on('error', reject);
    req.end(data);
  });
};
