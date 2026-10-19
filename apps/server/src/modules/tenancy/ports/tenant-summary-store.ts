import type { TenantSummary } from '../types/tenant-summary';

export interface TenantSearchCursor {
  createdAt: Date;
  id: string;
}

export interface TenantSearchPage {
  entries: TenantSummary[];
  nextCursor: TenantSearchCursor | null;
}

/** The shop summary the dashboard and the lifecycle gate read, by shop id -- plus the operator's own
    shop-name/slug search (LIF-24), used to find a tenant id before suspending or restoring it. */
export interface TenantSummaryStore {
  findSummary(tenantId: string): Promise<TenantSummary | null>;
  findSummaryBySlug(slug: string): Promise<TenantSummary | null>;
  search(
    query: string | null,
    cursor: TenantSearchCursor | null,
    limit: number,
  ): Promise<TenantSearchPage>;
}
