import type { TenantSummary } from '../types/tenant-summary';

/** The shop summary the dashboard and the lifecycle gate read, by shop id. */
export interface TenantSummaryStore {
  findSummary(tenantId: string): Promise<TenantSummary | null>;
}
