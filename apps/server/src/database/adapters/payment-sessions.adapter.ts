import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentPageReportRepository,
  PaymentSessionRepository,
  TenantRepository,
  TransactionRunner,
  UsedTransactionIdsRepository,
  type NewPaymentSession,
  type PaymentPageReportRow,
  type PaymentSubmission,
  type SelectPaymentPageReport,
  type SelectPaymentSession,
  type Transaction,
} from '@lytronix/db';
import type {
  PaymentPageReportReason,
  PaymentPageReportStatus,
  PaymentSessionState,
} from '@lytronix/validators';
import type { PaymentSessionStore } from '../../modules/payment-sessions/ports/payment-session-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePaymentSessionStore implements PaymentSessionStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PaymentSessionRepository) private readonly sessions: PaymentSessionRepository,
    @Inject(UsedTransactionIdsRepository) private readonly used: UsedTransactionIdsRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(PaymentPageReportRepository) private readonly reports: PaymentPageReportRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  tenantOfRef(ref: string): Promise<string | null> {
    return this.sessions.tenantOfRef(this.database.handle.db, ref);
  }

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  insert(
    tx: Transaction,
    tenantId: string,
    values: NewPaymentSession,
  ): Promise<SelectPaymentSession> {
    return this.sessions.insert(tx, tenantId, values);
  }

  findByRef(
    tx: Transaction,
    tenantId: string,
    ref: string,
    lock = false,
  ): Promise<SelectPaymentSession | null> {
    return this.sessions.findByRef(tx, tenantId, ref, lock);
  }

  orderNumberOf(tx: Transaction, tenantId: string, orderId: string): Promise<string> {
    return this.sessions.orderNumberOf(tx, tenantId, orderId);
  }

  openForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectPaymentSession | null> {
    return this.sessions.openForOrder(tx, tenantId, orderId);
  }

  openForTracking(
    tx: Transaction,
    tenantId: string,
    trackingId: string,
  ): Promise<SelectPaymentSession | null> {
    return this.sessions.openForTracking(tx, tenantId, trackingId);
  }

  submit(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: PaymentSubmission,
  ): Promise<SelectPaymentSession> {
    return this.sessions.submit(tx, tenantId, id, values);
  }

  lockExpired(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]> {
    return this.sessions.lockExpired(tx, tenantId, now);
  }

  setState(
    tx: Transaction,
    tenantId: string,
    id: string,
    state: PaymentSessionState,
  ): Promise<void> {
    return this.sessions.setState(tx, tenantId, id, state);
  }

  transactionIdUsed(tx: Transaction, transactionId: string): Promise<boolean> {
    return this.used.exists(tx, transactionId);
  }

  paymentPageOf(tx: Transaction, tenantId: string): Promise<{ suspendedAt: Date | null } | null> {
    return this.tenants.paymentPageOf(tx, tenantId);
  }

  setPaymentPageSuspension(
    tx: Transaction,
    tenantId: string,
    suspension: { reason: string; at: Date } | null,
  ): Promise<void> {
    return this.tenants.setPaymentPageSuspension(tx, tenantId, suspension);
  }

  insertReport(
    tx: Transaction,
    values: {
      tenantId: string;
      ref: string;
      reason: PaymentPageReportReason;
      note: string | null;
      ip: string | null;
    },
  ): Promise<void> {
    return this.reports.insert(tx, values);
  }

  reportsFromIpSince(tx: Transaction, ip: string, since: Date): Promise<number> {
    return this.reports.countFromIpSince(tx, ip, since);
  }

  listReports(status: PaymentPageReportStatus, limit: number): Promise<PaymentPageReportRow[]> {
    return this.reports.list(this.database.handle.db, status, limit);
  }

  dismissReport(
    tx: Transaction,
    id: string,
    operatorId: string,
    at: Date,
  ): Promise<SelectPaymentPageReport | null> {
    return this.reports.dismiss(tx, id, operatorId, at);
  }

  actionReports(tx: Transaction, tenantId: string, operatorId: string, at: Date): Promise<number> {
    return this.reports.actionOpen(tx, tenantId, operatorId, at);
  }

  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.sessions.deleteAllForTenant(tx, tenantId);
    await this.reports.deleteForTenant(tx, tenantId);
  }
}
