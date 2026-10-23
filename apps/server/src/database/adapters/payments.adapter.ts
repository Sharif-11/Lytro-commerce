import { Inject, Injectable } from '@nestjs/common';
import {
  InvoiceCountersRepository,
  InvoicesRepository,
  PlanPaymentsRepository,
  TransactionRunner,
  UsedTransactionIdsRepository,
  type SelectInvoice,
  type TenantPaymentFilter,
  type Transaction,
} from '@lytronix/db';
import { PlanPaymentKind } from '@lytronix/validators';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { InvoicesStore, NewInvoiceValues } from '../../modules/payments/ports/invoices-store';
import type { InvoiceLine, InvoiceRecord } from '../../modules/payments/types/invoice';
import type {
  NewPlanPaymentValues,
  PlanPaymentsStore,
  PlanPaymentStatusValues,
} from '../../modules/payments/ports/plan-payments-store';
import { DatabaseService } from '../database.service';

/** control.invoices / control.invoice_counters (BIL-12/13, DAT-07). */
@Injectable()
export class DrizzleInvoicesStore implements InvoicesStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(InvoiceCountersRepository) private readonly counters: InvoiceCountersRepository,
    @Inject(InvoicesRepository) private readonly invoices: InvoicesRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  takeNextNumber(tx: Transaction) {
    return this.counters.takeNext(tx);
  }

  async insert(
    tx: Transaction,
    number: number,
    values: NewInvoiceValues,
    lines: readonly InvoiceLine[],
  ): Promise<InvoiceRecord> {
    const row = await this.invoices.insert(tx, { ...values, number });
    await this.invoices.insertLines(tx, row.id, lines);
    return { ...row, lines: [...lines] };
  }

  async findById(tx: Transaction, id: string): Promise<InvoiceRecord | null> {
    const row = await this.invoices.findById(tx, id);
    return row ? ((await this.withLines(tx, [row]))[0] ?? null) : null;
  }

  async listForTenant(tx: Transaction, tenantId: string): Promise<InvoiceRecord[]> {
    return this.withLines(tx, await this.invoices.listForTenant(tx, tenantId));
  }

  async listForTenants(tx: Transaction, tenantIds: string[]): Promise<InvoiceRecord[]> {
    return this.withLines(tx, await this.invoices.listForTenants(tx, tenantIds));
  }

  /** BIL-12: each invoice with its lines, read in one query. */
  private async withLines(tx: Transaction, rows: SelectInvoice[]): Promise<InvoiceRecord[]> {
    const lines = await this.invoices.linesOf(
      tx,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({ ...row, lines: lines.get(row.id) ?? [] }));
  }
}

/** control.plan_payments / control.used_transaction_ids (D2-1). */
@Injectable()
export class DrizzlePlanPaymentsStore implements PlanPaymentsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlanPaymentsRepository) private readonly payments: PlanPaymentsRepository,
    @Inject(UsedTransactionIdsRepository) private readonly usedIds: UsedTransactionIdsRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insert(tx: Transaction, values: NewPlanPaymentValues) {
    return this.payments.insert(tx, values);
  }

  findById(tx: Transaction, id: string) {
    return this.payments.findById(tx, id);
  }

  findByIdForUpdate(tx: Transaction, id: string) {
    return this.payments.findByIdForUpdate(tx, id);
  }

  listPending(tx: Transaction, kind?: PlanPaymentKind) {
    return this.payments.listPending(tx, kind);
  }

  findActiveForTenant(tx: Transaction, tenantId: string, kind: PlanPaymentKind) {
    return this.payments.findActiveForTenant(tx, tenantId, kind);
  }

  submittedForTenant(tx: Transaction, tenantId: string, kinds: PlanPaymentKind[]) {
    return this.payments.submittedForTenant(tx, tenantId, kinds);
  }

  listForTenants(tx: Transaction, tenantIds: string[], filter: TenantPaymentFilter) {
    return this.payments.listForTenants(tx, tenantIds, filter);
  }

  needingAttention(tx: Transaction, tenantId: string, kinds: PlanPaymentKind[], since: Date) {
    return this.payments.needingAttention(tx, tenantId, kinds, since);
  }

  async setStatus(tx: Transaction, id: string, values: PlanPaymentStatusValues) {
    try {
      await this.payments.setStatus(tx, id, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, 'plan_payments_transaction_id_idx')) {
        throw new UniqueViolation('transactionId');
      }
      throw error;
    }
  }

  transactionIdUsed(tx: Transaction, transactionId: string) {
    return this.usedIds.exists(tx, transactionId);
  }

  async registerTransactionId(tx: Transaction, transactionId: string, tenantId: string) {
    await this.usedIds.insert(tx, transactionId, tenantId);
  }

  expireStalePending(tx: Transaction, cutoff: Date) {
    return this.payments.expireStalePending(tx, cutoff);
  }
}
