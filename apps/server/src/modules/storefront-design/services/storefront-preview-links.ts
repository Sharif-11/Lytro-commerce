import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { STOREFRONT_PREVIEW_MINUTES } from '@lytronix/validators';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { MINUTE_MS } from '../../../common/time';
import type { StorefrontPreviewLink } from '../types/storefront-design';

// The signing key is drawn from the server's OTP secret under a label of its own, so it signs nothing else and needs
// no setting of its own; a new secret ends every link at once.
const KEY_LABEL = 'lytro storefront preview link v1';

interface PreviewClaims {
  /** The shop. */
  t: string;
  /** When it stops working, in milliseconds since 1970. */
  e: number;
}

/**
 * SB-12: the short-lived signed link that draws a shop's storefront from its draft. It names the shop and when it ends;
 * it is never stored, so it lasts no longer than STOREFRONT_PREVIEW_MINUTES and opens only that shop's draft.
 */
@Injectable()
export class StorefrontPreviewLinks {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Pick<Env, 'OTP_SECRET'>) {
    this.key = Buffer.from(hkdfSync('sha256', env.OTP_SECRET, '', KEY_LABEL, 32));
  }

  make(tenantId: string, now: Date = new Date()): StorefrontPreviewLink {
    const expires = now.getTime() + STOREFRONT_PREVIEW_MINUTES * MINUTE_MS;
    const claims: PreviewClaims = { t: tenantId, e: expires };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { token: `${body}.${this.sign(body)}`, expiresAt: new Date(expires).toISOString() };
  }

  /** Whether the token is one this server signed, for this shop, and not yet ended. */
  opens(token: string, tenantId: string, now: Date = new Date()): boolean {
    const [body, signature, extra] = token.split('.');
    if (body === undefined || signature === undefined || extra !== undefined) return false;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const claims = this.claimsOf(body);
    return claims !== null && claims.t === tenantId && claims.e > now.getTime();
  }

  private sign(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }

  private claimsOf(body: string): PreviewClaims | null {
    try {
      const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (typeof value !== 'object' || value === null) return null;
      const { t, e } = value as Record<string, unknown>;
      return typeof t === 'string' && typeof e === 'number' ? { t, e } : null;
    } catch {
      return null;
    }
  }
}
