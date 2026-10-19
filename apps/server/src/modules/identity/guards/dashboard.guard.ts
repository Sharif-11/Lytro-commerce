import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SHOP_HEADER } from '@lytronix/shared-types';
import { TenantState } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DASHBOARD, type DashboardOptions } from '../../../common/decorators/dashboard';
import { headerValue } from '../../../common/http';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { HostClassifier } from '../../tenancy/services/host-classifier';
import type { SessionRecord } from '../ports/session-store';
import { ShopMemberships } from '../services/shop-memberships';

// LIF-06, LIF-11, AUTH-22: after the paid period the owner may reach lapsed routes only; staff reach nothing once locked.
export const LAPSED: ReadonlySet<TenantState> = new Set([
  TenantState.Locked,
  TenantState.Archived,
  TenantState.Deleted,
]);

export interface DashboardRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  ip?: string;
  /** The session as this request sees it: the shop it names, and who the person acts as there (TEN-31). */
  session?: SessionRecord;
  /** The session exactly as it was signed in, before the guard narrowed it to one shop. */
  signedIn?: SessionRecord;
  tenant?: TenantSummary | null;
}

/** The dashboard's shop rules (TEN-31, AUTH-22, AUTH-23, LIF-24). */
@Injectable()
export class DashboardGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
    @Inject(ShopMemberships) private readonly memberships: ShopMemberships,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<DashboardOptions | undefined>(DASHBOARD, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};
    const request = context.switchToHttp().getRequest<DashboardRequest>();
    const session = request.session;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});

    // TEN-31: the dashboard is served from the platform's own host only. A shop's subdomain or custom domain serves
    // its public pages, never the dashboard.
    if (this.hosts.classify(headerValue(request.headers.host)).kind !== 'platform') {
      throw new ApiError('not_found', 'PageNotFound', {});
    }

    // The shop comes from the page: app.lytro.app/<slug>/... names it in SHOP_HEADER. The steps right after sign-up
    // (checkout, set-up) have no slug in their path and work on the shop the session started on.
    const slug = headerValue(request.headers[SHOP_HEADER])?.trim().toLowerCase() || null;
    const membership =
      slug === null
        ? await this.memberships.ofSession(session)
        : await this.memberships.ofSlug(session, slug);
    if (membership === null) {
      // A shop the person doesn't belong to answers exactly like one that doesn't exist.
      if (slug !== null) throw new ApiError('not_found', 'PageNotFound', {});
      if (options.withoutShop) {
        request.signedIn = session;
        request.tenant = null;
        return true;
      }
      throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    }

    // Everything after this guard (PermissionGuard, the controllers) reads the shop and the acting person from the
    // session, so the request's session is narrowed to this shop -- as its owner, or as the person's staff row.
    request.signedIn = session;
    request.session = { ...session, tenantId: membership.tenant.id, userId: membership.userId };
    const tenant = membership.tenant;
    const ownerSession = membership.userId === null;
    if (tenant.suspendedAt !== null) {
      // LIF-24 (decided 2026-10-16): suspension is a separate axis from lifecycle state, stricter than any
      // lapsed state for everyone except the owner, who gets only the narrow set of routes that help
      // resolve it (view balance, top up, renew/buy a plan) -- never the broader read_only set, never staff.
      if (!(options.suspendedOwner === true && ownerSession)) {
        throw new ApiError('tenant_offline', 'ShopUnavailable', {});
      }
      request.tenant = tenant;
      return true;
    }
    if (LAPSED.has(tenant.state) && !(options.lapsed === true && ownerSession)) {
      throw new ApiError('tenant_offline', 'ShopUnavailable', {});
    }
    // LIF-06: read_only allows view/export/buy-a-plan/password-change/sign-out, refuses every other write.
    if (tenant.state === TenantState.ReadOnly && options.readOnlyWrite !== true) {
      const method = (request.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        throw new ApiError('tenant_offline', 'ShopUnavailable', {});
      }
    }

    request.tenant = tenant;
    return true;
  }
}
