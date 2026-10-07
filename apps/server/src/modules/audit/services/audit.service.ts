import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { AuditStore } from '../ports/audit-store';
import { AUDIT_STORE } from '../tokens';
import type { ActivityCursor, ActivityFilters, ActivityPage, AuditEntry } from '../types/activity';

/**
 * Writes and reads one shop's activity log (AUD-01 to AUD-08). The writer is a leaf: it depends on nothing else in
 * the server, so any module can record an event without creating an import cycle.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_STORE) private readonly store: AuditStore) {}

  /** Writes inside the caller's own transaction, so the entry commits with the change it records. */
  record(tx: Transaction, entry: AuditEntry): Promise<void> {
    return this.store.insert(tx, entry);
  }

  /** Opens its own transaction, for a caller that does not already have one open. */
  recordStandalone(entry: AuditEntry): Promise<void> {
    return this.store.run(entry.tenantId, (tx) => this.store.insert(tx, entry));
  }

  async list(
    tenantId: string,
    filters: ActivityFilters,
    cursor: ActivityCursor | null,
    limit: number,
  ): Promise<ActivityPage> {
    // One extra row decides whether a next page exists, without a second round trip (never OFFSET).
    const rows = await this.store.run(tenantId, (tx) =>
      this.store.list(tx, tenantId, filters, cursor, limit + 1),
    );
    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;
    const last = entries[entries.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
    return { entries, nextCursor };
  }

  /** Deletes entries past the given shop's retention cutoff (AUD-06). Returns how many were removed. */
  purgeForTenant(tenantId: string, cutoff: Date): Promise<number> {
    return this.store.run(tenantId, (tx) => this.store.purgeOlderThan(tx, tenantId, cutoff));
  }
}
