import { Inject, Injectable } from '@nestjs/common';
import { ActivityLogRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import type { AuditStore } from '../../modules/audit/ports/audit-store';
import type {
  ActivityCursor,
  ActivityFilters,
  ActivityRecord,
  AuditEntry,
} from '../../modules/audit/types/activity';
import { DatabaseService } from '../database.service';

/** Database-backed activity log. */
@Injectable()
export class DrizzleAuditStore implements AuditStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ActivityLogRepository) private readonly log: ActivityLogRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insert(tx: Transaction, entry: AuditEntry): Promise<void> {
    return this.log.insert(tx, {
      tenantId: entry.tenantId,
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      result: entry.result,
      summary: entry.summary ?? null,
    });
  }

  list(
    tx: Transaction,
    tenantId: string,
    filters: ActivityFilters,
    cursor: ActivityCursor | null,
    limit: number,
  ): Promise<ActivityRecord[]> {
    return this.log.list(tx, tenantId, filters, cursor, limit);
  }
}
