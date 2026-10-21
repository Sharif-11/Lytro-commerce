import { mediaLinkMessage } from '@lytronix/shared-types';
import type { MediaOrigin } from '../src/origin';
import { StoreUnavailable } from '../src/origin';
import type { MediaAccess, UsageRecorder } from '../src/usage';

export const SHOP = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
export const OTHER_SHOP = '9a8b7c6d-5e4f-4321-8abc-def012345678';

/** The bucket, in memory: whole objects or one `bytes=a-b` range, sent in chunks; every read is counted. */
export class FakeOrigin implements MediaOrigin {
  readonly objects = new Map<string, { body: Uint8Array; type: string }>();
  readonly reads: { key: string; range: string | null }[] = [];
  down = false;

  put(key: string, body: Uint8Array, type = 'image/webp'): void {
    this.objects.set(key, { body, type });
  }

  get(key: string, range: string | null): Promise<Response | null> {
    this.reads.push({ key, range });
    if (this.down) return Promise.reject(new StoreUnavailable('the test store is down'));
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(null);
    const size = object.body.byteLength;
    const headers = new Headers({ 'content-type': object.type, 'accept-ranges': 'bytes' });
    const asked = range === null ? null : /^bytes=(\d+)-(\d*)$/.exec(range);
    if (range !== null && asked === null) throw new Error(`unexpected range ${range}`);
    const start = asked ? Number(asked[1]) : 0;
    const end = asked && asked[2] !== '' ? Math.min(Number(asked[2]), size - 1) : size - 1;
    const part = object.body.slice(start, end + 1);
    headers.set('content-length', String(part.byteLength));
    if (asked)
      headers.set('content-range', `bytes ${String(start)}-${String(end)}/${String(size)}`);
    return Promise.resolve(new Response(chunked(part), { status: asked ? 206 : 200, headers }));
  }
}

/** A body sent in 64 KB chunks, as a real store would. */
function chunked(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + 65_536));
      at += 65_536;
    },
  });
}

/** Keeps every usage point, in place of Analytics Engine. */
export class FakeUsage implements UsageRecorder {
  readonly points: { tenantId: string; access: MediaAccess; status: number; bytes: number }[] = [];

  record(tenantId: string, access: MediaAccess, status: number, bytes: number): void {
    this.points.push({ tenantId, access, status, bytes });
  }
}

/** A signed private link's query, made the way the server makes it (BND-07). */
export async function signedQuery(
  secret: string,
  path: string,
  expiresAt: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(mediaLinkMessage(path, expiresAt)),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `expires=${String(expiresAt)}&signature=${signature}`;
}

/** Bytes of this length, each its index mod 251, so a wrong slice shows; built in blocks, so large ones are quick. */
export function bytesOf(length: number): Uint8Array {
  const block = Uint8Array.from({ length: 251 }, (_, index) => index);
  const bytes = new Uint8Array(length);
  for (let at = 0; at < length; at += 251)
    bytes.set(block.subarray(0, Math.min(251, length - at)), at);
  return bytes;
}

/** A body's SHA-256, to compare megabytes at once. */
export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
