import type { TenantOperatorFactsRow, TenantSearchCursor, TenantSearchFilters } from '@lytronix/db';
import type { TenantSort } from '@lytronix/validators';
import type { TenantSummary } from '../types/tenant-summary';

export type { TenantSearchCursor, TenantSearchFilters };

/** PLN-02, PLN-11: a search's row also says its plan's version and how many overrides it has; D8-24, its owner's phone. */
export type TenantSearchEntry = TenantSummary & {
  planVersion: number | null;
  overrideCount: number;
  ownerPhone: string | null;
};

export interface TenantSearchPage {
  entries: TenantSearchEntry[];
  nextCursor: TenantSearchCursor | null;
}

/** The shop summary the dashboard and the lifecycle gate read, by shop id -- plus the operator's own shop list
    (ADM-02, D8-7). */
export interface TenantSummaryStore {
  findSummary(tenantId: string): Promise<TenantSummary | null>;
  findSummaryBySlug(slug: string): Promise<TenantSummary | null>;
  /** OPERATOR-CONSOLE-DESIGN §5: what the operator's shop page reads beyond a summary. */
  operatorFacts(tenantId: string): Promise<TenantOperatorFactsRow | null>;
  search(
    filters: TenantSearchFilters,
    sort: TenantSort,
    cursor: TenantSearchCursor | null,
    limit: number,
  ): Promise<TenantSearchPage>;
}
