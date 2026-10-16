import type { Transaction } from '@lytronix/db';
import type { DataExportDetail, DataExportRecord } from '../types/data-export';

export interface MarkReadyValues {
  fileContent: Buffer;
  fileSizeBytes: number;
  contentType: string;
  readyAt: Date;
  expiresAt: Date;
}

/** tenant.data_exports (LIF-16/17). Every method runs inside the caller's transaction. */
export interface DataExportStore {
  /** Runs the work in a transaction with the tenant context set. For a caller with no transaction open yet. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  insert(tx: Transaction, tenantId: string): Promise<DataExportRecord>;
  /** Includes the file bytes -- the download route's own read. */
  findById(tx: Transaction, tenantId: string, id: string): Promise<DataExportDetail | null>;
  listForTenant(tx: Transaction, tenantId: string): Promise<DataExportRecord[]>;
  markReady(tx: Transaction, tenantId: string, id: string, values: MarkReadyValues): Promise<void>;
  markFailed(tx: Transaction, tenantId: string, id: string, reason: string): Promise<void>;
  /** LIF-19: the day-60 deletion job's own step. */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
