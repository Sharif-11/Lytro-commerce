import type { Transaction } from '@lytronix/db';
import type { InvoiceKind, PaidByMethod, PlanLimits } from '@lytronix/validators';
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
  /**
   * Slice 9.9 (Mushak-6.3's buyer): left out, the shop's business address as it stands at issue; a credit note gives
   * its invoice's.
   */
  shopAddress?: string | null;
  planName: string | null;
  planVersion: number | null;
  /** Null for a pack (PLN-15), which is used up rather than run for a period. */
  periodStart: Date | null;
  periodEnd: Date | null;
  discountAmount: string;
  paymentMethod: PaidByMethod;
  paymentReference: string | null;
  /** BIL-19: the payment this invoice is the receipt of. */
  planPaymentId: string | null;
  /** ADM-14: a manual entry produced it. */
  recordedByPlatform?: boolean;
  /** ADM-15, D8-49: on a credit note, the invoice it takes back. */
  reversesInvoiceId?: string | null;
}

/** D9-7, LEG-03 (Slice 9.8): the VAT an invoice carries -- the seller as registered, the rate and the VAT it includes. */
export interface InvoiceVat {
  sellerName: string;
  sellerAddress: string;
  sellerBin: string;
  vatRate: string;
  vatAmount: string;
}

/** control.invoices / control.invoice_counters (BIL-12/13, DAT-07). */
export interface InvoicesStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** DAT-07: locks the one counter row and returns the next gap-free number, inside the caller's `tx`. */
  takeNextNumber(tx: Transaction): Promise<number>;
  /** BIL-12: the invoice, its VAT when it carries any (D9-7), and its lines, in the caller's transaction. */
  insert(
    tx: Transaction,
    number: number,
    values: NewInvoiceValues,
    vat: InvoiceVat | null,
    lines: readonly InvoiceLine[],
  ): Promise<InvoiceRecord>;
  /** Slice 9.9: the shop's business address now (TEN-30), null when it has none. */
  shopAddressOf(tx: Transaction, tenantId: string): Promise<string | null>;
  findById(tx: Transaction, id: string): Promise<InvoiceRecord | null>;
  findForPayment(tx: Transaction, planPaymentId: string): Promise<InvoiceRecord | null>;
  listForTenant(tx: Transaction, tenantId: string): Promise<InvoiceRecord[]>;
  listForTenants(tx: Transaction, tenantIds: string[]): Promise<InvoiceRecord[]>;
}
