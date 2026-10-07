import { Inject, Injectable } from '@nestjs/common';
import { TENANT_SUMMARY_STORE } from '../tokens';
import type { TenantSummaryStore } from '../ports/tenant-summary-store';
import type { RetentionTarget } from '../types/retention-target';
import type { TenantSummary } from '../types/tenant-summary';

/** Reads a shop's summary by id, for the dashboard and the lifecycle gate (AUTH-22, AUTH-23). */
@Injectable()
export class TenantSummaries {
  constructor(@Inject(TENANT_SUMMARY_STORE) private readonly store: TenantSummaryStore) {}

  findById(tenantId: string): Promise<TenantSummary | null> {
    return this.store.findSummary(tenantId);
  }

  listForRetentionPurge(): Promise<RetentionTarget[]> {
    return this.store.listForRetentionPurge();
  }
}
