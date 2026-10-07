import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantState } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DASHBOARD, type DashboardOptions } from '../../../common/decorators/dashboard';
import { headerValue } from '../../../common/http';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { HostClassifier } from '../../tenancy/services/host-classifier';
import { TenantResolver } from '../../tenancy/services/tenant-resolver.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { SessionRecord } from '../ports/session-store';

// LIF-06, LIF-11, AUTH-22: after the paid period the owner may reach lapsed routes only; staff reach nothing once locked.
export const LAPSED: ReadonlySet<TenantState> = new Set([
  TenantState.Locked,
  TenantState.Archived,
  TenantState.Deleted,
]);

export interface DashboardRequest {
  headers: Record<string, string | string[] | undefined>;
  session?: SessionRecord;
  tenant?: TenantSummary | null;
}

/** The dashboard's tenant rules (TEN-28, AUTH-22, AUTH-23, LIF-24). */
@Injectable()
export class DashboardGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<DashboardOptions | undefined>(DASHBOARD, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};
    const request = context.switchToHttp().getRequest<DashboardRequest>();
    const session = request.session;
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});

    const rawHost = headerValue(request.headers.host);
    const target = this.hosts.classify(rawHost);
    if (target.kind === 'invalid') throw new NotFoundException('Page not found.');

    // Staff work on their own shop's host only. The platform host is for the account owner.
    if (target.kind === 'platform' && session.userId !== null) {
      throw new ApiError('forbidden', 'Request not accepted.', {});
    }

    if (target.kind !== 'platform') {
      const resolved = await this.resolver.resolve(rawHost);
      if (resolved.outcome === 'not_found') throw new NotFoundException('Page not found.');
      if (session.tenantId !== resolved.tenant.id) {
        throw new ApiError('forbidden', 'Request not accepted.', {});
      }
    }

    if (session.tenantId === null) {
      if (options.withoutShop) {
        request.tenant = null;
        return true;
      }
      throw new ApiError('forbidden', 'Create your shop to continue.', { next: 'create-shop' });
    }

    const tenant = await this.summaries.findById(session.tenantId);
    if (!tenant) throw new NotFoundException('Page not found.');
    if (tenant.suspendedAt !== null) {
      throw new ApiError('tenant_offline', 'This shop is not available right now.', {});
    }
    const ownerSession = session.userId === null;
    if (LAPSED.has(tenant.state) && !(options.lapsed === true && ownerSession)) {
      throw new ApiError('tenant_offline', 'This shop is not available right now.', {});
    }

    request.tenant = tenant;
    return true;
  }
}
