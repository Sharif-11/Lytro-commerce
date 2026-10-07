import type { RetentionTarget } from '../types/retention-target';
import type { TenantSummary } from '../types/tenant-summary';

/** The shop summary the dashboard and the lifecycle gate read, by shop id. */
export interface TenantSummaryStore {
  findSummary(tenantId: string): Promise<TenantSummary | null>;
  /** Every shop with its plan's activity retention, for the purge job (AUD-06). */
  listForRetentionPurge(): Promise<RetentionTarget[]>;
}
