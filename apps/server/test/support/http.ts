import { request as httpRequest } from 'node:http';

// JSON requests over real HTTP to a test server on 127.0.0.1, shared by the end-to-end specs.
export interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export function postJson(
  port: number,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return send(port, 'POST', path, payload, headers);
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
  method: 'GET' | 'POST',
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
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: text ? (JSON.parse(text) as unknown) : undefined,
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
