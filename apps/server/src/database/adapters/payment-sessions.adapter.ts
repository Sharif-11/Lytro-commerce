import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentSessionRepository,
  TenantRepository,
  TransactionRunner,
  UsedTransactionIdsRepository,
  type NewPaymentSession,
  type PaymentSubmission,
  type SelectPaymentSession,
  type Transaction,
} from '@lytronix/db';
import type { PaymentSessionState } from '@lytronix/validators';
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

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.sessions.deleteAllForTenant(tx, tenantId);
  }
}
