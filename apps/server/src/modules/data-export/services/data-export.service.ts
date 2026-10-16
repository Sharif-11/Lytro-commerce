import { Inject, Injectable } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'node:stream';
import { ActorType, AuditAction, AuditResult, QueueName } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import type { ActivityRecord } from '../../audit/types/activity';
import { InvoicesService } from '../../payments/services/invoices.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import { StaffService } from '../../staff/services/staff.service';
import { MailService } from '../../shared/mail/services/mail.service';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import type { DataExportStore } from '../ports/data-export-store';
import { DATA_EXPORT_STORE } from '../tokens';
import type { DataExportRecord } from '../types/data-export';

const EXPIRY_MS = 24 * 60 * 60 * 1000; // LIF-16: the download link expires after 24 hours.

export interface DownloadedFile {
  fileContent: Buffer;
  contentType: string;
  fileSizeBytes: number;
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

type CsvValue = string | number | null | undefined;

function toCsv(rows: Record<string, CsvValue>[], columns: string[]): string {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','));
  return [header, ...lines].join('\n');
}

/** LIF-16/17: the owner's own export of payments and the activity log -- orders/customers/products are not
 * built yet (no module to read them from), so this is scoped to the two categories that actually exist
 * today; a third category is a data-fetcher addition here, not an architecture change. */
@Injectable()
export class DataExportService {
  constructor(
    @Inject(DATA_EXPORT_STORE) private readonly store: DataExportStore,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async request(tenantId: string): Promise<DataExportRecord> {
    const record = await this.store.run(tenantId, async (tx) => {
      const created = await this.store.insert(tx, tenantId);
      await this.jobQueue.enqueue(tx, QueueName.DataExport, { exportId: created.id, tenantId });
      return created;
    });
    const actorId = await this.staff.ownerId(tenantId);
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action: AuditAction.DataExportRequested,
      targetType: 'data_export',
      targetId: record.id,
      result: AuditResult.Success,
      summary: {},
    });
    return record;
  }

  list(tenantId: string): Promise<DataExportRecord[]> {
    return this.store.run(tenantId, (tx) => this.store.listForTenant(tx, tenantId));
  }

  async download(tenantId: string, id: string): Promise<DownloadedFile> {
    const record = await this.store.run(tenantId, (tx) => this.store.findById(tx, tenantId, id));
    if (!record) throw new ApiError('not_found', 'ExportNotFound', {});
    if (record.status !== 'ready' || !record.fileContent) {
      throw new ApiError('not_found', 'ExportNotReady', {});
    }
    if (!record.expiresAt || record.expiresAt.getTime() < Date.now()) {
      throw new ApiError('not_found', 'ExportExpired', {});
    }

    const actorId = await this.staff.ownerId(tenantId);
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action: AuditAction.DataExportDownloaded,
      targetType: 'data_export',
      targetId: id,
      result: AuditResult.Success,
      summary: {},
    });

    return {
      fileContent: record.fileContent,
      contentType: record.contentType ?? 'application/zip',
      fileSizeBytes: record.fileSizeBytes ?? record.fileContent.length,
    };
  }

  /** LIF-19: the day-60 deletion job's own step -- every export row and its file content, gone with the
   * rest of the tenant's business data. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run(tenantId, (tx) => this.store.deleteAllForTenant(tx, tenantId));
  }

  /** The worker's own entry point. Never throws -- a generation failure is recorded on the row itself
   * (`failed`, with a reason), not lost in an unhandled job rejection. */
  async generate(tenantId: string, exportId: string): Promise<void> {
    try {
      const invoices = await this.invoices.listForTenant(tenantId);
      const activity = await this.loadAllActivity(tenantId);
      const zip = await this.buildZip(invoices, activity);

      const readyAt = new Date();
      const expiresAt = new Date(readyAt.getTime() + EXPIRY_MS);
      await this.store.run(tenantId, (tx) =>
        this.store.markReady(tx, tenantId, exportId, {
          fileContent: zip,
          fileSizeBytes: zip.length,
          contentType: 'application/zip',
          readyAt,
          expiresAt,
        }),
      );

      const owner = await this.staff.ownerContact(tenantId);
      const ownerEmail = owner?.email;
      if (ownerEmail) {
        await this.store.run(tenantId, (tx) => this.mail.queueDataExportReady(tx, ownerEmail));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      await this.store.run(tenantId, (tx) => this.store.markFailed(tx, tenantId, exportId, reason));
    }
  }

  /** Follows AuditService.list's own keyset cursor to completion -- the export needs every entry, not one page. */
  private async loadAllActivity(tenantId: string): Promise<ActivityRecord[]> {
    const all: ActivityRecord[] = [];
    let cursor: Parameters<AuditService['list']>[2] = null;
    for (;;) {
      const page = await this.audit.list(tenantId, {}, cursor, 500);
      all.push(...page.entries);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return all;
  }

  private buildZip(invoices: InvoiceRecord[], activity: ActivityRecord[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = new ZipArchive();
      const chunks: Buffer[] = [];
      const out = new PassThrough();
      out.on('data', (chunk: Buffer) => chunks.push(chunk));
      out.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      archive.on('error', reject);
      archive.pipe(out);

      const invoiceRows = invoices.map((invoice) => ({
        number: invoice.number,
        kind: invoice.kind,
        amount: invoice.amount,
        creditAmount: invoice.creditAmount,
        billingTermLabel: invoice.billingTermLabel,
        issuedAt: invoice.issuedAt.toISOString(),
      }));
      archive.append(
        toCsv(invoiceRows, [
          'number',
          'kind',
          'amount',
          'creditAmount',
          'billingTermLabel',
          'issuedAt',
        ]),
        { name: 'payments.csv' },
      );
      archive.append(JSON.stringify(invoiceRows, null, 2), { name: 'payments.json' });

      const activityRows = activity.map((entry) => ({
        id: entry.id,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        result: entry.result,
        createdAt: entry.createdAt.toISOString(),
      }));
      archive.append(
        toCsv(activityRows, [
          'id',
          'actorType',
          'actorId',
          'action',
          'targetType',
          'targetId',
          'result',
          'createdAt',
        ]),
        { name: 'activity-log.csv' },
      );
      archive.append(JSON.stringify(activityRows, null, 2), { name: 'activity-log.json' });

      void archive.finalize();
    });
  }
}
