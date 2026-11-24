import { createHash } from 'node:crypto';

/** Meta's hashing for its identifiers: SHA-256 of the normalised value, as lowercase hex. */
export function metaHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Meta's phone form: the country code and number, digits only -- 8801712345678 for 01712345678. */
export function metaPhoneOf(localPhone: string): string {
  return `88${localPhone.replace(/\D/g, '')}`;
}
