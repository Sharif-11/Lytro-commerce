import { and, desc, eq } from 'drizzle-orm';
import { dataExports, type SelectDataExport } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// LIF-16/17: one row per export request. Insert at request time (pending), updated once by the worker
// (ready with its content, or failed with a reason) -- never updated again after that.
export class DataExportsRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insert(tx: Transaction, tenantId: string): Promise<SelectDataExport> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx.insert(dataExports).values({ tenantId }).returning();
    if (!row) throw new Error('insert returned no data export row');
    return row;
  }

  async findById(tx: Transaction, tenantId: string, id: string): Promise<SelectDataExport | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(dataExports)
      .where(and(eq(dataExports.id, id), eq(dataExports.tenantId, tenantId)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Never selects `fileContent` -- the list screen has no reason to pull every blob over the wire. */
  async listForTenant(
    tx: Transaction,
    tenantId: string,
  ): Promise<Omit<SelectDataExport, 'fileContent'>[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({
        id: dataExports.id,
        tenantId: dataExports.tenantId,
        status: dataExports.status,
        fileSizeBytes: dataExports.fileSizeBytes,
        contentType: dataExports.contentType,
        failureReason: dataExports.failureReason,
        requestedAt: dataExports.requestedAt,
        readyAt: dataExports.readyAt,
        expiresAt: dataExports.expiresAt,
      })
      .from(dataExports)
      .where(eq(dataExports.tenantId, tenantId))
      .orderBy(desc(dataExports.requestedAt));
  }

  async markReady(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: {
      fileContent: Buffer;
      fileSizeBytes: number;
      contentType: string;
      readyAt: Date;
      expiresAt: Date;
    },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(dataExports)
      .set({ status: 'ready', ...values })
      .where(eq(dataExports.id, id));
  }

  async markFailed(tx: Transaction, tenantId: string, id: string, reason: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(dataExports)
      .set({ status: 'failed', failureReason: reason })
      .where(eq(dataExports.id, id));
  }

  /** LIF-19: deletes every export row (and its file content) of a tenant being deleted at day 60. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(dataExports).where(eq(dataExports.tenantId, tenantId));
  }
}
