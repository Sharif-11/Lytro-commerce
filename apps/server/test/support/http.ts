import { request as httpRequest } from 'node:http';

// JSON requests over real HTTP to a test server on 127.0.0.1, shared by the end-to-end specs.
// Every path is relative to /api/v1 automatically, except the unversioned routes (src/common/unversioned-routes.ts) --
// so no call site (post('/staff', ...), get('/plans'), ...) needed to change when the prefix was added.
const UNVERSIONED_PREFIXES = ['/health', '/test-only/'];

function withApiPrefix(path: string): string {
  if (UNVERSIONED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix)))
    return path;
  return `/api/v1${path}`;
}

export interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** Unwrapped for convenience: the envelope's `data` on success, or the pre-envelope `{ error: {...} } }`
   * shape on failure, so none of this suite's existing assertions had to change when the envelope was added
   * (see support/response-envelope.spec.ts for tests against the real wire shape). */
  body: unknown;
  /** The raw wire body, exactly as the server sent it -- { success, statusCode, message, data|errors }. */
  envelope: unknown;
}

interface SuccessEnvelope {
  success: true;
  data: unknown;
}

interface ErrorEnvelope {
  success: false;
  message: string;
  errors: { code: unknown; details: unknown };
}

function isEnvelope(value: unknown): value is SuccessEnvelope | ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'success' in value;
}

function unwrap(parsed: unknown): unknown {
  if (!isEnvelope(parsed)) return parsed;
  if (parsed.success) return parsed.data;
  return {
    error: { code: parsed.errors.code, message: parsed.message, details: parsed.errors.details },
  };
}

export function postJson(
  port: number,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return send(port, 'POST', path, payload, headers);
}

export function deleteJson(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return send(port, 'DELETE', path, undefined, headers);
}

export function patchJson(
  port: number,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return send(port, 'PATCH', path, payload, headers);
}

export function putJson(
  port: number,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return send(port, 'PUT', path, payload, headers);
}

export function getJson(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return send(port, 'GET', path, undefined, headers);
}

function send(
  port: number,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<HttpResult> {
  return sendExact(port, method, withApiPrefix(path), payload, headers);
}

/**
 * A request to exactly this path, with no /api/v1 added -- for the public API host, whose own addresses are
 * /v1/... (API-14), and for a preflight (OPTIONS, API-23).
 */
export function sendExact(
  port: number,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<HttpResult> {
  const data = payload === undefined ? '' : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          const envelope = text ? (JSON.parse(text) as unknown) : undefined;
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: unwrap(envelope),
            envelope,
          });
        });
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

/** The session cookie as a browser would send it back: the name=value pair from Set-Cookie. */
export function cookieFrom(result: HttpResult): string {
  const raw = result.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? '').split(';')[0] ?? '';
}
