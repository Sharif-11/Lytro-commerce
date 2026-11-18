import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// Every call the storefront makes to the server, from its own server only (SFT-11: no key reaches a browser). It calls
// the server inside the deployment, naming the host it means: the public API answers on `api.<domain>` and takes the
// shop from the key alone. `fetch` cannot name a host, so this uses node:http.

/** The API's envelope (API-14): data on success, a code and fields on failure. */
interface Envelope {
  success: boolean;
  data?: unknown;
  errors?: { code: string; details?: Record<string, unknown> };
}

/** One answer: its status, and the data or the error code. */
export interface ServerAnswer<T> {
  status: number;
  data: T | null;
  code: string | null;
  details: Record<string, unknown>;
  /** The Retry-After header as it came, when it came: how long a busy server asks to be left (Slice 9.10). */
  retryAfter?: string | null;
}

export interface ServerCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  /** The host the server should take the request as being for. */
  host: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** A raw answer: its status, its type and its body, for what is not an envelope (an app icon). */
export interface ServerBytes {
  status: number;
  contentType: string | null;
  body: Buffer;
  retryAfter: string | null;
}

// How long a call waits for the server's answer.
const ANSWER_WITHIN_MS = 10_000;

/**
 * What a call the server didn't answer in time comes back as: busy (503), with no wait named, so the page shows the
 * busy page, a figure says it can't be shown, and a checkout says to try again, as for the server's own 503 -- never the
 * error page (Slice 9.10: staging's recheck, 2026-11-18, showed 9,394 such pages as 500s while the server was busy).
 */
const NOT_ANSWERED_IN_TIME = 503;

/** Sends calls to the server's address and unwraps its envelope. */
export class ServerApi {
  private readonly base: URL;

  constructor(
    serverUrl: string,
    private readonly answerWithinMs: number = ANSWER_WITHIN_MS,
  ) {
    this.base = new URL(serverUrl);
  }

  async send<T>(call: ServerCall): Promise<ServerAnswer<T>> {
    const answer = await this.exchange(call, 'application/json');
    let envelope: Envelope | null = null;
    try {
      envelope = JSON.parse(answer.body.toString('utf8')) as Envelope;
    } catch {
      envelope = null;
    }
    return {
      status: answer.status,
      data: envelope?.success ? ((envelope.data ?? null) as T | null) : null,
      code: envelope && !envelope.success ? (envelope.errors?.code ?? null) : null,
      details: envelope?.errors?.details ?? {},
      retryAfter: answer.retryAfter,
    };
  }

  /** The answer as it came, unparsed: an image the storefront passes on (Slice 12c's app icons). */
  bytes(call: ServerCall): Promise<ServerBytes> {
    return this.exchange(call, '*/*');
  }

  private exchange(call: ServerCall, accept: string): Promise<ServerBytes> {
    const target = new URL(call.path, this.base);
    const payload = call.body === undefined ? undefined : JSON.stringify(call.body);
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const outgoing = send(
        target,
        {
          method: call.method,
          headers: {
            ...call.headers,
            host: call.host,
            accept,
            ...(payload === undefined
              ? {}
              : {
                  'content-type': 'application/json',
                  'content-length': String(Buffer.byteLength(payload)),
                }),
          },
          timeout: this.answerWithinMs,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            resolve({
              status: incoming.statusCode ?? 502,
              contentType: incoming.headers['content-type'] ?? null,
              body: Buffer.concat(chunks),
              retryAfter: incoming.headers['retry-after'] ?? null,
            });
          });
          incoming.on('error', reject);
        },
      );
      outgoing.on('timeout', () => {
        resolve({
          status: NOT_ANSWERED_IN_TIME,
          contentType: null,
          body: Buffer.alloc(0),
          retryAfter: null,
        });
        outgoing.destroy();
      });
      outgoing.on('error', reject);
      if (payload !== undefined) outgoing.write(payload);
      outgoing.end();
    });
  }
}
