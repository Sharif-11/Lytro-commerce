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

export interface PlanPriceRecord {
  planId: string;
  billingTermId: string;
  price: string;
}
