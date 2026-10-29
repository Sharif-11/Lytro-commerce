import { Inject, Injectable } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'node:stream';
import {
  ActorType,
  AuditAction,
  AuditResult,
  QueueName,
  visibleOrderStatus,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { toCsv } from '../../../common/csv';
import { AuditService } from '../../audit/services/audit.service';
import { CustomerService } from '../../customers/services/customer.service';
import type { CustomerRecord } from '../../customers/types/customers';
import { OrderService } from '../../orders/services/order.service';
import type { OrderLineRecord, OrderRecord } from '../../orders/types/orders';
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

/** One order of the export, with its items. */
interface ExportedOrder {
  order: OrderRecord;
  items: OrderLineRecord[];
}

/** LIF-16/17: the owner's own export of payments, the activity log, and (Phase 4) orders and customers -- products are
 * not exported yet (KNOWN-GAPS §13); another category is a data-fetcher addition here, not an architecture change. */
@Injectable()
export class DataExportService {
  constructor(
    @Inject(DATA_EXPORT_STORE) private readonly store: DataExportStore,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(CustomerService) private readonly customers: CustomerService,
  ) {}

  async request(tenantId: string, ip?: string | null): Promise<DataExportRecord> {
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
      ip: ip ?? null,
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

  async download(tenantId: string, id: string, ip?: string | null): Promise<DownloadedFile> {
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
      ip: ip ?? null,
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
      const orders = await this.orders.exportAll(tenantId);
      const customers = await this.customers.listAll(tenantId);
      const zip = await this.buildZip(invoices, activity, orders, customers);

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

  private buildZip(
    invoices: InvoiceRecord[],
    activity: ActivityRecord[],
    orders: ExportedOrder[],
    customers: CustomerRecord[],
  ): Promise<Buffer> {
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
        shopName: invoice.shopName ?? '',
        ownerName: invoice.ownerName ?? '',
        planName: invoice.planName ?? '',
        planVersion: invoice.planVersion ?? '',
        periodStart: invoice.periodStart?.toISOString() ?? '',
        periodEnd: invoice.periodEnd?.toISOString() ?? '',
        discountAmount: invoice.discountAmount,
        paymentMethod: invoice.paymentMethod ?? '',
        paymentReference: invoice.paymentReference ?? '',
        issuedAt: invoice.issuedAt.toISOString(),
      }));
      archive.append(
        toCsv(invoiceRows, [
          'number',
          'kind',
          'amount',
          'creditAmount',
          'billingTermLabel',
          'shopName',
          'ownerName',
          'planName',
          'planVersion',
          'periodStart',
          'periodEnd',
          'discountAmount',
          'paymentMethod',
          'paymentReference',
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

      // ORD-46: each order as it was taken, its items from their own snapshots.
      const orderRows = orders.map(({ order }) => ({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        status: visibleOrderStatus({
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          confirmed: order.confirmedAt !== null,
          override: order.statusOverride,
        }),
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        source: order.source,
        fulfilmentType: order.fulfilmentType,
        customerName: order.customerName ?? '',
        customerPhone: order.customerPhone ?? '',
        deliveryAddress: order.deliveryAddress ?? '',
        tableRef: order.tableRef ?? '',
        subtotal: order.subtotal,
        deliveryCharge: order.deliveryCharge,
        discount: order.discount,
        grandTotal: order.grandTotal,
        advanceDue: order.advanceDue,
        codAmount: order.codAmount,
        cancelReason: order.cancelReason ?? '',
        notes: order.notes ?? '',
      }));
      archive.append(
        toCsv(orderRows, [
          'orderNumber',
          'createdAt',
          'status',
          'paymentStatus',
          'fulfillmentStatus',
          'source',
          'fulfilmentType',
          'customerName',
          'customerPhone',
          'deliveryAddress',
          'tableRef',
          'subtotal',
          'deliveryCharge',
          'discount',
          'grandTotal',
          'advanceDue',
          'codAmount',
          'cancelReason',
          'notes',
        ]),
        { name: 'orders.csv' },
      );
      const itemRows = orders.flatMap(({ order, items }) =>
        items.map((item) => ({
          orderNumber: order.orderNumber,
          productName: item.productName,
          attributes: item.attributeValues
            .map((value) => `${value.name}: ${value.value}`)
            .join('; '),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          itemDiscount: item.itemDiscount,
          itemTotal: item.itemTotal,
        })),
      );
      archive.append(
        toCsv(itemRows, [
          'orderNumber',
          'productName',
          'attributes',
          'quantity',
          'unitPrice',
          'itemDiscount',
          'itemTotal',
        ]),
        { name: 'order-items.csv' },
      );
      archive.append(
        JSON.stringify(
          orders.map(({ order, items }) => ({ ...order, items })),
          null,
          2,
        ),
        { name: 'orders.json' },
      );

      // CUS-01: each customer, with the figures its orders give it.
      const customerRows = customers.map((customer) => ({
        name: customer.name ?? '',
        phone: customer.phone ?? '',
        orderCount: customer.orderCount,
        totalSpent: customer.totalSpent,
        lastOrderAt: customer.lastOrderAt?.toISOString() ?? '',
      }));
      archive.append(
        toCsv(customerRows, ['name', 'phone', 'orderCount', 'totalSpent', 'lastOrderAt']),
        { name: 'customers.csv' },
      );
      archive.append(JSON.stringify(customerRows, null, 2), { name: 'customers.json' });

      void archive.finalize();
    });
  }
}
