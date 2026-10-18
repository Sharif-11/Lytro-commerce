import type { Transaction } from '@lytronix/db';
import type { InvoiceKind, PlanLimits } from '@lytronix/validators';
import type { InvoiceRecord } from '../types/invoice';

export interface NewInvoiceValues {
  tenantId: string;
  kind: InvoiceKind;
  planSnapshot: PlanLimits;
  amount: string;
  creditAmount: string;
  billingTermLabel: string;
}

/** control.invoices / control.invoice_counters (BIL-12/13, DAT-07). */
export interface InvoicesStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** DAT-07: locks the one counter row and returns the next gap-free number, inside the caller's `tx`. */
  takeNextNumber(tx: Transaction): Promise<number>;
  insert(tx: Transaction, number: number, values: NewInvoiceValues): Promise<InvoiceRecord>;
  findById(tx: Transaction, id: string): Promise<InvoiceRecord | null>;
  listForTenant(tx: Transaction, tenantId: string): Promise<InvoiceRecord[]>;
  listForTenants(tx: Transaction, tenantIds: string[]): Promise<InvoiceRecord[]>;
}
