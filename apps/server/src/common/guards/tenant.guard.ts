import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../api-error';
import { headerValue } from '../http';
import { SKIP_TENANT } from '../decorators/skip-tenant';
import { SKIP_EDGE } from '../decorators/skip-edge';
import { DASHBOARD, type DashboardOptions } from '../decorators/dashboard';
import { PUBLIC_API } from '../decorators/public-api';
import type { CachedTenant } from '../../modules/tenancy/types/cached-tenant';
import { HostClassifier } from '../../modules/tenancy/services/host-classifier';
import { TenantResolver } from '../../modules/tenancy/services/tenant-resolver.service';
import { EdgeSecret } from './edge-secret';

export const EDGE_HEADER = 'x-lytronix-edge-secret';

// The subset of the HTTP request the guard reads and writes. Kept loose so this file does not depend on Express types.
export interface TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  tenant?: CachedTenant;
  /** API-14: set when the request came in on the API host at its public /v1/ address. */
  publicApi?: boolean;
}

/** Runs before authentication on every route. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EdgeSecret) private readonly edgeSecret: EdgeSecret,
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
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
    const publicApi = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_API, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<TenantRequest>();

    if (
      !skipEdge &&
      this.edgeSecret.isRequired() &&
      !this.edgeSecret.matches(request.headers[EDGE_HEADER])
    ) {
      throw new ApiError('forbidden', 'RequestNotAccepted');
    }
    // API-14, TEN-02: a public API route answers only on the API host at /v1/..., and its own guard takes the shop
    // from the key. Nothing else answers on the API host: it takes key authentication only.
    if (publicApi) {
      if (request.publicApi !== true) throw new ApiError('not_found', 'PageNotFound');
      return true;
    }
    if (this.hosts.classify(headerValue(request.headers.host)).kind === 'api') {
      throw new ApiError('not_found', 'PageNotFound');
    }
    if (skip || dashboard) return true;

    const result = await this.resolver.resolve(headerValue(request.headers.host));
    if (result.outcome === 'not_found') throw new ApiError('not_found', 'PageNotFound');
    if (result.outcome === 'closed') {
      throw new ApiError('tenant_offline', 'ShopUnavailable');
    }

    request.tenant = result.tenant;
    return true;
  }
}
