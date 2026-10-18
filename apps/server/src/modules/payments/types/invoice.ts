import type { InvoiceKind, PlanLimits, PlanPaymentMethod } from '@lytronix/validators';

export interface InvoiceRecord {
  id: string;
  tenantId: string;
  number: number;
  kind: InvoiceKind;
  planSnapshot: PlanLimits;
  amount: string;
  creditAmount: string;
  billingTermLabel: string;
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
}
