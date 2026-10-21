import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SECRET_BOX_KEYS } from './tokens';

/**
 * SEC-01, SEC-10: what a sealed value is for. It is bound into the value with the shop it belongs to, so a value
 * copied to another shop's row, or to another purpose, does not open.
 */
export enum SecretPurpose {
  ConversionsApiToken = 'meta_conversions_api_token',
  CatalogFeedToken = 'catalog_feed_token',
}

/** The key new values are sealed with, and the one before it while values are moved over (32 bytes each). */
export interface SecretBoxKeys {
  current: Buffer;
  previous: Buffer | null;
}

/** A sealed value that no key here opens, or that was changed: never shown as if it were the value. */
export class SecretUnreadable extends Error {
  constructor() {
    super('a sealed value could not be opened');
    this.name = 'SecretUnreadable';
  }
}

// [format 1][key fingerprint 4][nonce 12][tag 16][ciphertext]
const FORMAT = 1;
const FINGERPRINT_BYTES = 4;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + FINGERPRINT_BYTES + NONCE_BYTES + TAG_BYTES;

function fingerprintOf(key: Buffer): Buffer {
  return createHash('sha256').update(key).digest().subarray(0, FINGERPRINT_BYTES);
}

function boundTo(purpose: SecretPurpose, tenantId: string): Buffer {
  return Buffer.from(`${purpose}:${tenantId}`, 'utf8');
}

/**
 * SEC-01, SEC-09, SEC-10: the server's sealed storage for credentials -- AES-256-GCM, a fresh nonce for every value,
 * each value naming the key that sealed it, so a second key can be brought in and the old one retired. Opening
 * happens only in this process, at the moment a value is needed; the key never leaves it.
 */
@Injectable()
export class SecretBox {
  private readonly keys: Map<string, Buffer>;
  private readonly current: Buffer;

  constructor(@Inject(SECRET_BOX_KEYS) keys: SecretBoxKeys) {
    this.current = keys.current;
    this.keys = new Map(
      [keys.current, ...(keys.previous ? [keys.previous] : [])].map((key) => [
        fingerprintOf(key).toString('hex'),
        key,
      ]),
    );
  }

  seal(plain: string, purpose: SecretPurpose, tenantId: string): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.current, nonce);
    cipher.setAAD(boundTo(purpose, tenantId));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([
      Buffer.from([FORMAT]),
      fingerprintOf(this.current),
      nonce,
      cipher.getAuthTag(),
      body,
    ]);
  }

  open(sealed: Buffer, purpose: SecretPurpose, tenantId: string): string {
    if (sealed.length < HEADER_BYTES || sealed[0] !== FORMAT) throw new SecretUnreadable();
    const key = this.keys.get(sealed.subarray(1, 1 + FINGERPRINT_BYTES).toString('hex'));
    if (!key) throw new SecretUnreadable();
    const nonceAt = 1 + FINGERPRINT_BYTES;
    const tagAt = nonceAt + NONCE_BYTES;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(nonceAt, tagAt));
      decipher.setAAD(boundTo(purpose, tenantId));
      decipher.setAuthTag(sealed.subarray(tagAt, HEADER_BYTES));
      return Buffer.concat([
        decipher.update(sealed.subarray(HEADER_BYTES)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretUnreadable();
    }
  }
}
