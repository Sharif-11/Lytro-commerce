import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import type { HttpResponse } from '../../../common/http';
import { CLOSED_STATES } from '../../tenancy/services/tenant-resolver.service';
import { ApiKeyAuthenticator } from '../services/api-key-authenticator';
import { CatalogFeedService } from '../services/catalog-feed.service';
import { RequestQuota } from '../services/request-quota';
import { VisitorLimit } from '../services/visitor-limit';
import { API_CLOCK } from '../tokens';
import type { PublicApiRequest } from './public-key.guard';

// FED-01: the feed's address ends in the token and `.csv`.
const FEED_FILE = /^(.+)\.csv$/;

interface FeedRequest extends PublicApiRequest {
  params: Record<string, string | undefined>;
}

/**
 * FED-01, FED-04, RTE-03, RTE-06: the gate of a catalog feed fetch. Meta's fetcher sends no key and no website, so
 * the token in the address stands for both: a token no shop holds, or a shop whose landing pages are offline (LND-02),
 * is not found, alike. Then the visitor's requests in the last minute, and the shop's this cycle, where the fetch
 * counts as one.
 */
@Injectable()
export class CatalogFeedGuard implements CanActivate {
  constructor(
    @Inject(CatalogFeedService) private readonly feeds: CatalogFeedService,
    @Inject(ApiKeyAuthenticator) private readonly authenticator: ApiKeyAuthenticator,
    @Inject(VisitorLimit) private readonly visitors: VisitorLimit,
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FeedRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const now = this.clock();
    const token = FEED_FILE.exec(request.params['file'] ?? '')?.[1] ?? '';
    const tenantId = await this.feeds.tenantOfToken(token);
    const shop = tenantId === null ? null : await this.authenticator.shopOf(tenantId);
    if (!shop || CLOSED_STATES.has(shop.row.state) || shop.row.suspendedAt !== null) {
      throw new ApiError('not_found', 'PageNotFound', {});
    }
    await this.visitors.admit(shop, request, response, now);
    if (!(await this.quota.take(shop, now))) {
      throw new ApiError('quota_exceeded', 'RequestsUsedUp', {});
    }
    request.apiShop = shop;
    return true;
  }
}
