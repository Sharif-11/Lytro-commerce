import { timingSafeEqual } from 'node:crypto';
import { CanActivate, Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { ApiError } from '../api-error';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';

/** Slice 12: the header the storefront's own server sends its secret in. */
export const STOREFRONT_HEADER = 'x-lytro-storefront';

/** Whether a request's header holds the storefront's secret, compared in constant time. */
export function holdsStorefrontSecret(
  received: string | string[] | undefined,
  expected: string,
): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Slice 12: lets through only the storefront's own server, by a secret the edge never adds, compared in constant time.
 * With no secret configured (development) every request passes.
 */
@Injectable()
export class StorefrontSecretGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Pick<Env, 'STOREFRONT_SECRET'>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.env.STOREFRONT_SECRET;
    if (expected === undefined) return true;
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    if (!holdsStorefrontSecret(request.headers[STOREFRONT_HEADER], expected)) {
      throw new ApiError('not_found', 'PageNotFound');
    }
    return true;
  }
}
