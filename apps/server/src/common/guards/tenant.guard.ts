import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../api-error';
import { SKIP_TENANT } from '../decorators/skip-tenant';
import { SKIP_EDGE } from '../decorators/skip-edge';
import { DASHBOARD, type DashboardOptions } from '../decorators/dashboard';
import type { CachedTenant } from '../../modules/tenancy/types/cached-tenant';
import { TenantResolver } from '../../modules/tenancy/services/tenant-resolver.service';
import { EdgeSecret } from './edge-secret';

export const EDGE_HEADER = 'x-lytronix-edge-secret';

// The subset of the HTTP request the guard reads and writes. Kept loose so this file does not depend on Express types.
export interface TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  tenant?: CachedTenant;
}

/**
 * Runs before authentication on every route. Refuses requests that did not pass through the trusted edge
 * (when a secret is configured), resolves the shop from the host, and attaches it to the request.
 * Error messages are generic: they never say whether a host exists or why a shop is closed.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EdgeSecret) private readonly edgeSecret: EdgeSecret,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipEdge = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_EDGE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_TENANT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const dashboard = this.reflector.getAllAndOverride<DashboardOptions | undefined>(DASHBOARD, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<TenantRequest>();

    if (
      !skipEdge &&
      this.edgeSecret.isRequired() &&
      !this.edgeSecret.matches(request.headers[EDGE_HEADER])
    ) {
      throw new ForbiddenException('Request not accepted.');
    }
    if (skip || dashboard) return true;

    const result = await this.resolver.resolve(this.firstHeader(request.headers.host));
    if (result.outcome === 'not_found') throw new NotFoundException('Page not found.');
    if (result.outcome === 'closed') {
      throw new ApiError('tenant_offline', 'This shop is not available right now.', {});
    }

    request.tenant = result.tenant;
    return true;
  }

  private firstHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
