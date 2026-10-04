import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

// AUTH-05: six-digit codes. Stored only as a keyed hash (decision: HMAC, not bcrypt), bound to the phone number,
// so a code for one number cannot be replayed for another.
export const CODE_LENGTH = 6;

export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

export function hashCode(code: string, phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time comparison of a typed code against the stored hash. */
export function codeMatches(
  code: string,
  phone: string,
  secret: string,
  storedHash: string,
): boolean {
  const expected = Buffer.from(hashCode(code, phone, secret));
  const stored = Buffer.from(storedHash);
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}
