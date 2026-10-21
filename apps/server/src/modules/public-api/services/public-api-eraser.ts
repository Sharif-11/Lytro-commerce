import { Inject, Injectable } from '@nestjs/common';
import type { ApiKeyStore } from '../ports/api-key-store';
import { API_KEY_STORE } from '../tokens';
import { AdTrackingService } from './ad-tracking.service';
import { CatalogFeedService } from './catalog-feed.service';

/**
 * LIF-19: the day-60 deletion job's public-side step: the shop's API keys (credentials, not history) and its request
 * counts, its ad tracking (a credential among it) and its catalog feed link.
 */
@Injectable()
export class PublicApiEraser {
  constructor(
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
    @Inject(AdTrackingService) private readonly adTracking: AdTrackingService,
    @Inject(CatalogFeedService) private readonly feeds: CatalogFeedService,
  ) {}

  async deleteAllForTenant(tenantId: string): Promise<void> {
    await this.store.deleteAllForTenant(tenantId);
    await this.adTracking.deleteAllForTenant(tenantId);
    await this.feeds.deleteAllForTenant(tenantId);
  }
}
