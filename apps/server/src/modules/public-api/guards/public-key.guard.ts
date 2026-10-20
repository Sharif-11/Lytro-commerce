import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { headerValue, type HttpRequest, type HttpResponse } from '../../../common/http';
import { SECOND_MS } from '../../../common/time';
import { CLOSED_STATES } from '../../tenancy/services/tenant-resolver.service';
import type { CachedTenant } from '../../tenancy/types/cached-tenant';
import { ApiKeyAuthenticator } from '../services/api-key-authenticator';
import { looksLikeKey } from '../services/api-key-value';
import { allowOrigin } from '../services/cors';
import { perMinuteLimit, RequestLimits } from '../services/request-limits';
import { RequestQuota } from '../services/request-quota';
import { API_CLOCK } from '../tokens';
import type { ApiShop, AuthenticatedKey } from '../types/public-api';

/** A public API request once its key is accepted: the shop it acts for (TEN-02, API-10) and the key. */
export interface PublicApiRequest extends HttpRequest {
  tenant?: CachedTenant;
  apiShop?: ApiShop;
  apiKey?: AuthenticatedKey;
}

const BEARER = /^Bearer\s+(\S+)$/i;

function secondsOf(ms: number): number {
  return Math.max(Math.ceil(ms / SECOND_MS), 1);
}

/**
 * API-03 to API-05, API-08, API-10, RTE-01, RTE-02, RTE-04, RTE-06, RTE-07: the gate of every public API route,
 * before any cache or handler runs, so a refused request costs nothing and a cached answer is still counted. In
 * order: the key (missing, unknown, revoked or expired is 401), the website it is used from (403), the shop open
 * (LIF-07), the visitor's and the key's requests in the last minute, then the shop's requests this cycle (429). The
 * shop comes from the key alone, never from the request.
 */
@Injectable()
export class PublicKeyGuard implements CanActivate {
  constructor(
    @Inject(ApiKeyAuthenticator) private readonly authenticator: ApiKeyAuthenticator,
    @Inject(RequestLimits) private readonly limits: RequestLimits,
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicApiRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const now = this.clock();
    const origin = headerValue(request.headers.origin) ?? null;
    // API-23: a registered website can read even a refusal, so its developer sees why.
    if (origin !== null && (await this.authenticator.isRegistered(origin))) {
      allowOrigin(response, origin);
    }

    const value = BEARER.exec(headerValue(request.headers.authorization) ?? '')?.[1] ?? null;
    if (value === null) throw new ApiError('unauthenticated', 'ApiKeyMissing', {});
    const key = looksLikeKey(value) ? await this.authenticator.keyOf(value) : null;
    if (!key) throw new ApiError('unauthenticated', 'ApiKeyInvalid', {});
    if (key.revokedAt !== null) throw new ApiError('unauthenticated', 'ApiKeyWasRevoked', {});
    if (key.expiresAt !== null && key.expiresAt <= now) {
      throw new ApiError('unauthenticated', 'ApiKeyExpired', {});
    }
    // API-08, RTE-07: a public key is a browser's, and only from a website registered on it.
    if (origin === null || !key.websites.includes(origin)) {
      throw new ApiError('forbidden', 'WebsiteNotRegistered', {});
    }

    const shop = await this.authenticator.shopOf(key.tenantId);
    if (!shop) throw new ApiError('unauthenticated', 'ApiKeyInvalid', {});
    if (CLOSED_STATES.has(shop.row.state) || shop.row.suspendedAt !== null) {
      throw new ApiError('tenant_offline', 'ShopUnavailable', {});
    }

    const visitor = this.limits.perVisitor(
      shop.row.id,
      this.clientIp.resolve(request) ?? 'unknown',
      now,
    );
    if (!visitor.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, secondsOf(visitor.resetMs));
    }
    const limit = perMinuteLimit(shop.limits);
    if (limit !== null) {
      const verdict = this.limits.perKey(key.id, limit, now);
      // RTE-02: every answer to a key says where it stands in its minute.
      response.setHeader('X-RateLimit-Limit', String(limit));
      response.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
      response.setHeader('X-RateLimit-Reset', String(secondsOf(verdict.resetMs)));
      if (!verdict.allowed) {
        throw new ApiError('rate_limited', 'TooManyRequests', {}, secondsOf(verdict.resetMs));
      }
    }
    if (!(await this.quota.take(shop, now))) {
      throw new ApiError('quota_exceeded', 'RequestsUsedUp', {});
    }

    request.tenant = {
      id: shop.row.id,
      slug: shop.row.slug,
      state: shop.row.state,
      suspendedAt: shop.row.suspendedAt,
    };
    request.apiShop = shop;
    request.apiKey = key;
    this.authenticator.touch(key.id);
    return true;
  }
}
