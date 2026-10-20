import { createHash, randomInt } from 'node:crypto';

// API-01: a public key is this prefix and 32 random letters and digits, about 190 bits.
const PUBLIC_KEY_PREFIX = 'lytro_pk_';
const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_RANDOM_LENGTH = 32;
// How much of a key the shop sees afterwards, to recognise it by: the prefix and four characters.
const SHOWN_LENGTH = PUBLIC_KEY_PREFIX.length + 4;
const PUBLIC_KEY_PATTERN = /^lytro_pk_[A-Za-z0-9]{32}$/;

/** A new public key's value, made from a cryptographic source. */
export function newPublicKeyValue(): string {
  let random = '';
  for (let index = 0; index < KEY_RANDOM_LENGTH; index += 1) {
    random += KEY_ALPHABET.charAt(randomInt(KEY_ALPHABET.length));
  }
  return `${PUBLIC_KEY_PREFIX}${random}`;
}

/** API-05: whether a presented value is shaped like a key at all, before any lookup. */
export function looksLikeKey(value: string): boolean {
  return PUBLIC_KEY_PATTERN.test(value);
}

/** API-01: what is stored in place of the value. The key is random enough that a fast hash is as good as a slow one. */
export function hashOfKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** API-01: the part of the key shown in the list. */
export function shownPrefixOf(value: string): string {
  return value.slice(0, SHOWN_LENGTH);
}
