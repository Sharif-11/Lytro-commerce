import { createHmac, timingSafeEqual } from 'node:crypto';

/** The three headers Resend's webhooks carry (Svix's names). */
export interface SvixHeaders {
  'svix-id'?: string | string[];
  'svix-timestamp'?: string | string[];
  'svix-signature'?: string | string[];
}

/** NTF-06: a webhook older or newer than this is refused, so a captured one can't be replayed later. Svix names none. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * NTF-06 (Slice 7.3): whether a webhook is really Resend's. Svix's manual check, as its page gives it: HMAC-SHA256,
 * keyed by the base64 part of the `whsec_` secret, over `id.timestamp.body` with the raw body, compared in constant
 * time with each `v1,` signature in the space-separated header; and the timestamp within the tolerance.
 */
export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  rawBody: Buffer,
  now: Date,
): boolean {
  const id = one(headers['svix-id']);
  const timestamp = one(headers['svix-timestamp']);
  const signatures = one(headers['svix-signature']);
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
