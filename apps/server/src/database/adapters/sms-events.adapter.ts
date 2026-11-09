import { Inject, Injectable } from '@nestjs/common';
import {
  OrderRepository,
  SmsEventCountsRepository,
  SmsLogRepository,
  SmsSettingsRepository,
  TenantRepository,
  TransactionRunner,
  type SelectSmsLog,
  type SelectSmsSettings,
  type SmsEventCounts,
  type SmsLogPage,
  type SmsReportRow,
  type SmsSettingsChange,
  type Transaction,
} from '@lytronix/db';
import type { SmsLogEntryKind } from '@lytronix/validators';
import type {
  SmsEventStore,
  SmsOrderFacts,
  SmsShop,
} from '../../modules/sms-events/ports/sms-event-store';
import { DatabaseService } from '../database.service';

/** tenant.sms_settings and tenant.sms_log, and the order and shop an SMS event reads (Slice 7.2). */
@Injectable()
export class DrizzleSmsEventStore implements SmsEventStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(SmsSettingsRepository) private readonly settingsRows: SmsSettingsRepository,
    @Inject(SmsLogRepository) private readonly logRows: SmsLogRepository,
    @Inject(SmsEventCountsRepository) private readonly countRows: SmsEventCountsRepository,
    @Inject(OrderRepository) private readonly orders: OrderRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  settings(tenantId: string): Promise<SelectSmsSettings | null> {
    return this.run(tenantId, (tx) => this.settingsRows.find(tx, tenantId));
  }

  changeSettings(tenantId: string, change: SmsSettingsChange): Promise<SelectSmsSettings> {
    return this.run(tenantId, (tx) => this.settingsRows.change(tx, tenantId, change));
  }

  async shop(tenantId: string): Promise<SmsShop | null> {
    const db = this.database.handle.db;
    const [summary, billing] = await Promise.all([
      this.tenants.findSummaryById(db, tenantId),
      this.tenants.findBillingInfo(db, tenantId),
    ]);
    if (!summary || !billing) return null;
    return {
      slug: summary.slug,
      shopName: summary.shopName,
      cycle: {
        state: billing.state,
        periodStart: billing.periodStart,
        createdAt: billing.createdAt,
      },
    };
  }

  async order(tenantId: string, orderId: string): Promise<SmsOrderFacts | null> {
    const row = await this.run(tenantId, (tx) =>
      this.orders.findOrder(tx, tenantId, orderId, false),
    );
    if (!row) return null;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      trackingId: row.trackingId,
      source: row.source,
      fulfilmentType: row.fulfilmentType,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerErased: row.customerErasedAt !== null,
      grandTotal: row.grandTotal,
      trackingLink: row.trackingLink,
      trackingCode: row.trackingCode,
    };
  }

  spentSince(tenantId: string, kinds: readonly SmsLogEntryKind[], since: Date): Promise<string> {
    return this.run(tenantId, (tx) => this.logRows.spentSince(tx, tenantId, kinds, since));
  }

  counts(tenantId: string, since: Date): Promise<SmsEventCounts> {
    return this.run(tenantId, (tx) => this.countRows.since(tx, tenantId, since));
  }

  report(tenantId: string, from: Date, to: Date): Promise<SmsReportRow[]> {
    return this.run(tenantId, (tx) => this.logRows.report(tx, tenantId, from, to));
  }

  notSentSince(tenantId: string, since: Date): Promise<{ failed: number; blocked: number }> {
    return this.run(tenantId, (tx) => this.logRows.notSentSince(tx, tenantId, since));
  }

  list(
    tenantId: string,
    page: SmsLogPage,
  ): Promise<(SelectSmsLog & { orderNumber: string | null })[]> {
    return this.run(tenantId, (tx) => this.logRows.list(tx, tenantId, page));
  }
}
