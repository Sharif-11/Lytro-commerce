import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';
import { holdsStorefrontSecret, STOREFRONT_HEADER } from './guards/storefront-secret.guard';
import { type HttpRequest, headerValue } from './http';

/** RTE-06 as amended (load fix 2): the header the storefront's own server names its shopper in. */
export const VISITOR_HEADER = 'x-lytro-visitor';

// The storefront's mark (`lytro-visitor`): 128 random bits as base64url, 22 characters.
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * RTE-06 as amended (the owner, 2026-11-20, load fix 2): the shopper a request is from, when the storefront's own server
 * vouches for them. Phones behind one mobile network's address share it, so the storefront names each shopper by a mark
 * of their own beside its secret, which the edge never adds (Slice 12); the limits then count the shopper alone and the
 * address only against a backstop. A request without the secret, or with no secret configured (development), names no
 * shopper and is counted by its address, as a shop's own website's calls are. The mark isn't a sign-in: a shopper who
 * drops it is held by the address backstop.
 */
@Injectable()
export class StorefrontShopper {
  constructor(@Inject(ENV) private readonly env: Pick<Env, 'STOREFRONT_SECRET'>) {}

  /** The shopper's mark, or null when the request isn't the storefront's own. */
  of(request: HttpRequest): string | null {
    const expected = this.env.STOREFRONT_SECRET;
    if (expected === undefined) return null;
    if (!holdsStorefrontSecret(request.headers[STOREFRONT_HEADER], expected)) return null;
    const mark = headerValue(request.headers[VISITOR_HEADER]);
    return mark !== undefined && VISITOR_PATTERN.test(mark) ? mark : null;
  }
}
