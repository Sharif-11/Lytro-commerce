import type { TenantOperatorFactsRow } from '@lytronix/db';
import type { TenantSummary } from '../types/tenant-summary';

export interface TenantSearchCursor {
  createdAt: Date;
  id: string;
}

/** PLN-02, PLN-11: a search's row also says its plan's version and how many overrides it has. */
export type TenantSearchEntry = TenantSummary & {
  planVersion: number | null;
  overrideCount: number;
};

export interface TenantSearchPage {
  entries: TenantSearchEntry[];
  nextCursor: TenantSearchCursor | null;
}

/** The shop summary the dashboard and the lifecycle gate read, by shop id -- plus the operator's own
    shop-name/slug search (LIF-24), used to find a tenant id before suspending or restoring it. */
export interface TenantSummaryStore {
  findSummary(tenantId: string): Promise<TenantSummary | null>;
  findSummaryBySlug(slug: string): Promise<TenantSummary | null>;
  /** OPERATOR-CONSOLE-DESIGN §5: what the operator's shop page reads beyond a summary. */
  operatorFacts(tenantId: string): Promise<TenantOperatorFactsRow | null>;
  search(
    query: string | null,
    cursor: TenantSearchCursor | null,
    limit: number,
  ): Promise<TenantSearchPage>;
}
