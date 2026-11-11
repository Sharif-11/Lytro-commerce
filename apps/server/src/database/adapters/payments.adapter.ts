import { Inject, Injectable } from '@nestjs/common';
import {
  InvoiceCountersRepository,
  InvoicesRepository,
  LytroMessageRepository,
  PlanPaymentsRepository,
  TransactionRunner,
  UsedTransactionIdsRepository,
  type SelectInvoice,
  type TenantPaymentFilter,
  type Transaction,
} from '@lytronix/db';
import { PaymentCancelReason, PlanPaymentKind } from '@lytronix/validators';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { InvoicesStore, NewInvoiceValues } from '../../modules/payments/ports/invoices-store';
import type { InvoiceLine, InvoiceRecord } from '../../modules/payments/types/invoice';
import type {
  NewPlanPaymentValues,
  PlanPaymentPageValues,
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

  async findForPayment(tx: Transaction, planPaymentId: string): Promise<InvoiceRecord | null> {
    const row = await this.invoices.findForPayment(tx, planPaymentId);
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
    @Inject(LytroMessageRepository) private readonly receipts: LytroMessageRepository,
    @Inject(UsedTransactionIdsRepository) private readonly usedIds: UsedTransactionIdsRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async insert(tx: Transaction, values: NewPlanPaymentValues) {
    try {
      return await this.payments.insert(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, 'plan_payments_one_open_upgrade_idx')) {
        throw new UniqueViolation('openUpgrade');
      }
      throw error;
    }
  }

  findById(tx: Transaction, id: string) {
    return this.payments.findById(tx, id);
  }

  findByIdForUpdate(tx: Transaction, id: string) {
    return this.payments.findByIdForUpdate(tx, id);
  }

  listPending(tx: Transaction, kind?: PlanPaymentKind, tenantId?: string) {
    return this.payments.listPending(tx, kind, tenantId);
  }

  findSubmittedOpen(tx: Transaction, tenantId: string, kind: PlanPaymentKind) {
    return this.payments.findSubmittedOpen(tx, tenantId, kind);
  }

  hasOpen(tx: Transaction, tenantId: string, kinds: PlanPaymentKind[]): Promise<boolean> {
    return this.payments.hasOpen(tx, tenantId, kinds);
  }

  closeOpen(
    tx: Transaction,
    tenantId: string,
    kinds: PlanPaymentKind[],
    reason: PaymentCancelReason,
    now: Date,
    id?: string,
  ) {
    return this.payments.closeOpen(tx, tenantId, kinds, reason, now, id);
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

  markReceiptUsed(tx: Transaction, transactionId: string, paymentId: string) {
    return this.receipts.markUsed(tx, transactionId, paymentId);
  }

  releaseReceipt(tx: Transaction, paymentId: string) {
    return this.receipts.releaseOfPayment(tx, paymentId);
  }

  lockTyped(tx: Transaction, transactionId: string) {
    return this.payments.lockTyped(tx, transactionId);
  }

  findByPageRef(tx: Transaction, ref: string) {
    return this.payments.findByPageRef(tx, ref);
  }

  lockByPageRef(tx: Transaction, ref: string) {
    return this.payments.lockByPageRef(tx, ref);
  }

  pageLabelOf(tx: Transaction, id: string) {
    return this.payments.pageLabelOf(tx, id);
  }

  setPage(tx: Transaction, id: string, values: PlanPaymentPageValues) {
    return this.payments.setPage(tx, id, values);
  }

  async changeTyped(
    tx: Transaction,
    id: string,
    values: { transactionId: string; senderNumber: string | null; submittedAt: Date },
  ) {
    try {
      await this.payments.changeTyped(tx, id, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, 'plan_payments_transaction_id_idx')) {
        throw new UniqueViolation('transactionId');
      }
      throw error;
    }
  }

  gatewayDue(tx: Transaction, now: Date) {
    return this.payments.gatewayDue(tx, now);
  }

  creditInstead(
    tx: Transaction,
    id: string,
    values: { kind: PlanPaymentKind; amount: string; verifiedBy: string | null; verifiedAt: Date },
  ) {
    return this.payments.creditInstead(tx, id, values);
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

  setEvidence(tx: Transaction, id: string, evidenceId: string) {
    return this.payments.setEvidence(tx, id, evidenceId);
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
