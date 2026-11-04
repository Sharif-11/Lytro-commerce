import type { TenantOperatorFactsRow } from '@lytronix/db';
import { Inject, Injectable } from '@nestjs/common';
import { TENANT_SUMMARY_STORE } from '../tokens';
import type {
  TenantSearchCursor,
  TenantSearchPage,
  TenantSummaryStore,
} from '../ports/tenant-summary-store';
import type { TenantSummary } from '../types/tenant-summary';

/** Reads a shop's summary by id, for the dashboard and the lifecycle gate (AUTH-22, AUTH-23) -- plus the
    operator's own shop-name/slug search (LIF-24). */
@Injectable()
export class TenantSummaries {
  constructor(@Inject(TENANT_SUMMARY_STORE) private readonly store: TenantSummaryStore) {}

  findById(tenantId: string): Promise<TenantSummary | null> {
    return this.store.findSummary(tenantId);
  }

  /** OPERATOR-CONSOLE-DESIGN §5: what the operator's shop page reads beyond a summary. */
  operatorFacts(tenantId: string): Promise<TenantOperatorFactsRow | null> {
    return this.store.operatorFacts(tenantId);
  }

  /** TEN-31: the shop a dashboard page names by its slug. */
  findBySlug(slug: string): Promise<TenantSummary | null> {
    return this.store.findSummaryBySlug(slug);
  }

  search(
    query: string | null,
    cursor: TenantSearchCursor | null,
    limit: number,
  ): Promise<TenantSearchPage> {
    return this.store.search(query, cursor, limit);
  }
}
