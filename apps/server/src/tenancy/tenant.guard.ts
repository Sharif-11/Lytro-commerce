import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { CachedTenant } from './tenant-cache';
import { TenantResolver } from './tenant-resolver.service';
import { TRUSTED_EDGE_SECRET } from './tokens';

export const EDGE_HEADER = 'x-lytronix-edge-secret';
export const SKIP_TENANT = 'skipTenant';

/** Marks a route that works without a shop, such as /health (decision R6). */
export const SkipTenant = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_TENANT, true);

// The subset of the HTTP request the guard reads and writes. Kept loose so this file does not depend on Express types.
export interface TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  tenant?: CachedTenant;
}

/** R3: compares the Cloudflare secret in constant time. Both values must be equal length to compare. */
export function edgeSecretMatches(
  received: string | string[] | undefined,
  expected: string,
): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Runs before authentication on every route. Refuses requests that did not pass through the trusted
 * edge (when a secret is configured), resolves the shop from the host, and attaches it to the request.
 * The error messages are generic: they never say whether a host exists or why a shop is closed.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TRUSTED_EDGE_SECRET) private readonly edgeSecret: string | undefined,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_TENANT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();

    if (this.edgeSecret && !edgeSecretMatches(request.headers[EDGE_HEADER], this.edgeSecret)) {
      throw new ForbiddenException('Request not accepted.');
    }

    const result = await this.resolver.resolve(headerValue(request.headers['host']));
    if (result.outcome === 'not_found') throw new NotFoundException('Page not found.');
    if (result.outcome === 'closed') {
      throw new ServiceUnavailableException('This shop is not available right now.');
    }

    request.tenant = result.tenant;
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
