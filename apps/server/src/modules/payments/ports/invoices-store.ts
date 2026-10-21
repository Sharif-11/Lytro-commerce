import type { Transaction } from '@lytronix/db';
import type { InvoiceKind, PlanLimits, PlanPaymentMethod } from '@lytronix/validators';
import type { InvoiceLine, InvoiceRecord } from '../types/invoice';

export interface NewInvoiceValues {
  tenantId: string;
  kind: InvoiceKind;
  /** Null on an add-on's own invoice (PLN-14), as are the term, plan name and version. */
  planSnapshot: PlanLimits | null;
  amount: string;
  creditAmount: string;
  billingTermLabel: string | null;
  // BIL-12: the rest of what the invoice states, as it stands at issue.
  shopName: string;
  ownerName: string | null;
  planName: string | null;
  planVersion: number | null;
  periodStart: Date;
  periodEnd: Date;
  discountAmount: string;
  paymentMethod: PlanPaymentMethod;
  paymentReference: string | null;
}

/** control.invoices / control.invoice_counters (BIL-12/13, DAT-07). */
export interface InvoicesStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** DAT-07: locks the one counter row and returns the next gap-free number, inside the caller's `tx`. */
  takeNextNumber(tx: Transaction): Promise<number>;
  /** BIL-12: the invoice and its lines, in the caller's transaction. */
  insert(
    tx: Transaction,
    number: number,
    values: NewInvoiceValues,
    lines: readonly InvoiceLine[],
  ): Promise<InvoiceRecord>;
  findById(tx: Transaction, id: string): Promise<InvoiceRecord | null>;
  listForTenant(tx: Transaction, tenantId: string): Promise<InvoiceRecord[]>;
  listForTenants(tx: Transaction, tenantIds: string[]): Promise<InvoiceRecord[]>;
}
