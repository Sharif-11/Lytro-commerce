export interface BillingTermRecord {
  id: string;
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
  defaultDiscountPct: string | null;
  tenantId: string | null;
  retiredAt: Date | null;
  createdAt: Date;
}

/** TRM-05: a term as the operator's list shows it. */
export interface OperatorBillingTermRecord extends BillingTermRecord {
  invoices: number;
  deletable: boolean;
}

export interface PlanPriceRecord {
  planId: string;
  billingTermId: string;
  price: string;
}
