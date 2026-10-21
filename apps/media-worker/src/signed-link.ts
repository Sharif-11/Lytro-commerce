import {
  MEDIA_LINK_EXPIRES_PARAM,
  MEDIA_LINK_SIGNATURE_PARAM,
  mediaLinkMessage,
} from '@lytronix/shared-types';

/** base64url, as the server writes it, to bytes; null when it is not base64url. */
function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * BND-07, MED-08: checks a signed private link -- its signature, made by the server with the shared secret over the
 * path and the expiry, and that it has not expired. The comparison is the runtime's own, in constant time.
 */
export class LinkVerifier {
  private key: Promise<CryptoKey> | null = null;

  constructor(
    private readonly secret: string,
    private readonly now: () => number,
  ) {}

  async verify(url: URL): Promise<boolean> {
    const expires = Number(url.searchParams.get(MEDIA_LINK_EXPIRES_PARAM));
    const signature = fromBase64Url(url.searchParams.get(MEDIA_LINK_SIGNATURE_PARAM) ?? '');
    if (!Number.isInteger(expires) || signature === null) return false;
    if (expires * 1000 <= this.now()) return false;
    return crypto.subtle.verify(
      'HMAC',
      await this.cryptoKey(),
      signature,
      new TextEncoder().encode(mediaLinkMessage(url.pathname, expires)),
    );
  }

  private cryptoKey(): Promise<CryptoKey> {
    this.key ??= crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return this.key;
  }
}
