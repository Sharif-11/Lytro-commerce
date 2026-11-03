import { Inject, Injectable } from '@nestjs/common';
import {
  ListenerMessageRepository,
  ListenerRepository,
  PaymentPageReportRepository,
  PaymentSessionRepository,
  TenantRepository,
  TransactionRunner,
  UsedTransactionIdsRepository,
  type NewPaymentSession,
  type PaidToSnapshot,
  type PaymentDecision,
  type PaymentPageReportRow,
  type PaymentSubmission,
  type SelectPaymentPageReport,
  type SelectPaymentSession,
  type Transaction,
} from '@lytronix/db';
import type {
  GatewayResult,
  PaymentMethod,
  PaymentPageReportReason,
  PaymentPageReportStatus,
  PaymentReviewReason,
  PaymentSessionState,
  TenantState,
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
    @Inject(ListenerRepository) private readonly listener: ListenerRepository,
    @Inject(ListenerMessageRepository) private readonly receipts: ListenerMessageRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  tenantOfRef(ref: string): Promise<string | null> {
    return this.sessions.tenantOfRef(this.database.handle.db, ref);
  }

  changeTyped(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { transactionId: string; senderNumber: string | null },
  ): Promise<SelectPaymentSession> {
    return this.sessions.changeTyped(tx, tenantId, id, values);
  }

  lockTyped(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<SelectPaymentSession | null> {
    return this.sessions.lockTyped(tx, tenantId, transactionId);
  }

  toReview(
    tx: Transaction,
    tenantId: string,
    id: string,
    reason: PaymentReviewReason,
  ): Promise<SelectPaymentSession> {
    return this.sessions.toReview(tx, tenantId, id, reason);
  }

  markTold(tx: Transaction, tenantId: string, id: string, at: Date): Promise<void> {
    return this.sessions.markTold(tx, tenantId, id, at);
  }

  lockUntold(tx: Transaction, tenantId: string, before: Date): Promise<SelectPaymentSession[]> {
    return this.sessions.lockUntold(tx, tenantId, before);
  }

  phoneSeenSince(tx: Transaction, tenantId: string, since: Date): Promise<boolean> {
    return this.listener.anySeenSince(tx, tenantId, since);
  }

  releaseReceipt(tx: Transaction, tenantId: string, sessionId: string): Promise<void> {
    return this.receipts.releaseOfSession(tx, tenantId, sessionId);
  }

  beginGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { method: PaymentMethod; accountId: string; feeHeld: string; test: boolean },
  ): Promise<void> {
    return this.sessions.beginGateway(tx, tenantId, id, values);
  }

  gatewayStarted(
    tx: Transaction,
    tenantId: string,
    id: string,
    checkout: { paymentId: string; redirectUrl: string },
  ): Promise<void> {
    return this.sessions.gatewayStarted(tx, tenantId, id, checkout);
  }

  endGateway(tx: Transaction, tenantId: string, id: string, result: GatewayResult): Promise<void> {
    return this.sessions.endGateway(tx, tenantId, id, result);
  }

  gatewayPaid(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: {
      transactionId: string;
      senderNumber: string | null;
      paidTo: PaidToSnapshot | null;
      at: Date;
    },
  ): Promise<SelectPaymentSession> {
    return this.sessions.gatewayPaid(tx, tenantId, id, values);
  }

  gatewayDue(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]> {
    return this.sessions.gatewayDue(tx, tenantId, now);
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

  findById(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<SelectPaymentSession | null> {
    return this.sessions.findById(tx, tenantId, id, lock);
  }

  decide(tx: Transaction, tenantId: string, id: string, decision: PaymentDecision): Promise<void> {
    return this.sessions.decide(tx, tenantId, id, decision);
  }

  capTotal(tx: Transaction, tenantId: string, since: Date): Promise<string> {
    return this.sessions.capTotal(tx, tenantId, since);
  }

  newShopOf(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ state: TenantState; createdAt: Date; newShopCap: boolean | null } | null> {
    return this.tenants.newShopOf(tx, tenantId);
  }

  setNewShopCap(tx: Transaction, tenantId: string, capped: boolean | null): Promise<void> {
    return this.tenants.setNewShopCap(tx, tenantId, capped);
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
