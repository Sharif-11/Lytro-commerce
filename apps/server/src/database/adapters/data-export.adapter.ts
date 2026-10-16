import { Inject, Injectable } from '@nestjs/common';
import { DataExportsRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import type {
  DataExportStore,
  MarkReadyValues,
} from '../../modules/data-export/ports/data-export-store';
import type {
  DataExportDetail,
  DataExportRecord,
} from '../../modules/data-export/types/data-export';
import { DatabaseService } from '../database.service';

function toRecord(row: {
  id: string;
  tenantId: string;
  status: string;
  fileSizeBytes: number | null;
  contentType: string | null;
  failureReason: string | null;
  requestedAt: Date;
  readyAt: Date | null;
  expiresAt: Date | null;
}): DataExportRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    status: row.status as DataExportRecord['status'],
    fileSizeBytes: row.fileSizeBytes,
    contentType: row.contentType,
    failureReason: row.failureReason,
    requestedAt: row.requestedAt,
    readyAt: row.readyAt,
    expiresAt: row.expiresAt,
  };
}

/** tenant.data_exports (LIF-16/17). */
@Injectable()
export class DrizzleDataExportStore implements DataExportStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(DataExportsRepository) private readonly exports: DataExportsRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async insert(tx: Transaction, tenantId: string): Promise<DataExportRecord> {
    return toRecord(await this.exports.insert(tx, tenantId));
  }

  async findById(tx: Transaction, tenantId: string, id: string): Promise<DataExportDetail | null> {
    const row = await this.exports.findById(tx, tenantId, id);
    if (!row) return null;
    return { ...toRecord(row), fileContent: row.fileContent };
  }

  async listForTenant(tx: Transaction, tenantId: string): Promise<DataExportRecord[]> {
    const rows = await this.exports.listForTenant(tx, tenantId);
    return rows.map(toRecord);
  }

  markReady(tx: Transaction, tenantId: string, id: string, values: MarkReadyValues): Promise<void> {
    return this.exports.markReady(tx, tenantId, id, values);
  }

  markFailed(tx: Transaction, tenantId: string, id: string, reason: string): Promise<void> {
    return this.exports.markFailed(tx, tenantId, id, reason);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.exports.deleteAllForTenant(tx, tenantId);
  }
}
