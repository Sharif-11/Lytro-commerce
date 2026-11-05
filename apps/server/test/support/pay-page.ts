import { request as httpRequest } from 'node:http';

/** Slice 5.8's part 2: the payment page as a browser gets it, on its own host: text, and forms posted as forms. */
export interface PayPageAnswer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
}

export function payPage(
  port: number,
  method: 'GET' | 'POST',
  path: string,
  body: Readonly<Record<string, string>> | null = null,
  host = 'pay.localhost',
): Promise<PayPageAnswer> {
  const data = body === null ? '' : new URLSearchParams(body).toString();
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          host,
          ...(body === null
            ? {}
            : {
                'content-type': 'application/x-www-form-urlencoded',
                'content-length': Buffer.byteLength(data),
              }),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
        });
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

/** The screen a page says it is drawing. */
export function screenOf(page: PayPageAnswer): string | undefined {
  return /data-screen="([a-z-]+)"/.exec(page.text)?.[1];
}
