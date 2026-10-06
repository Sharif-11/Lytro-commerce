import type { TenantState } from '@lytronix/validators';

/** A shop as the dashboard and the lifecycle gate see it (AUTH-22, AUTH-23). */
export interface TenantSummary {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspendedAt: Date | null;
  planName: string | null;
  periodEnd: Date | null;
}
