import type { InvoiceKind, PlanLimits } from '@lytronix/validators';

export interface InvoiceRecord {
  id: string;
  tenantId: string;
  number: number;
  kind: InvoiceKind;
  planSnapshot: PlanLimits;
  amount: string;
  creditAmount: string;
  billingTermLabel: string;
  issuedAt: Date;
}
