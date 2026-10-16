import type { TenantState } from '@lytronix/validators';

/** Mirrors `tenantSummarySchema` in apps/server/src/modules/team/dto/balance-response.dto.ts — see
    types/me.ts's own note on why this is a deliberate structural duplicate, not an import. */
export interface TenantSummary {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  periodEnd: string | null;
}

export interface TenantSummaryPage {
  entries: TenantSummary[];
  nextCursor: string | null;
}
