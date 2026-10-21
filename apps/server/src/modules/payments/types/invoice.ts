import type { InvoiceLine } from '@lytronix/db';
import type { InvoiceKind, PlanLimits, PlanPaymentMethod } from '@lytronix/validators';

export type { InvoiceLine };

export interface InvoiceRecord {
  id: string;
  tenantId: string;
  number: number;
  kind: InvoiceKind;
  /** Null on an add-on's own invoice (PLN-14), which names no plan. */
  planSnapshot: PlanLimits | null;
  amount: string;
  creditAmount: string;
  billingTermLabel: string | null;
  // BIL-12: copied at issue. Null only on invoices issued before these fields existed.
  shopName: string | null;
  ownerName: string | null;
  planName: string | null;
  planVersion: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  discountAmount: string;
  paymentMethod: PlanPaymentMethod | null;
  paymentReference: string | null;
  issuedAt: Date;
  /** BIL-12, PLN-14: what it is for, line by line; none on invoices issued before lines existed. */
  lines: InvoiceLine[];
}
