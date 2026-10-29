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
}

export interface ServerCall {
  method: 'GET' | 'POST';
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
}

/** Sends calls to the server's address and unwraps its envelope. */
export class ServerApi {
  private readonly base: URL;

  constructor(serverUrl: string) {
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
          timeout: 10_000,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            resolve({
              status: incoming.statusCode ?? 502,
              contentType: incoming.headers['content-type'] ?? null,
              body: Buffer.concat(chunks),
            });
          });
          incoming.on('error', reject);
        },
      );
      outgoing.on('timeout', () =>
        outgoing.destroy(new Error('the server did not answer in time')),
      );
      outgoing.on('error', reject);
      if (payload !== undefined) outgoing.write(payload);
      outgoing.end();
    });
  }
}
