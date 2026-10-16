// Deliberate structural duplicates of the server's own plan/term/price response shapes (apps/server's
// `planSchema`/`billingTermSchema`/`planPriceSchema`) — this app has no dependency on `@lytronix/validators`,
// and three interfaces aren't worth adding one for.
export interface PlanLimits {
  products?: number;
  orders_total?: number;
  orders_handled_monthly?: number;
  staff?: number;
  paired_devices?: number;
  storage_mb?: number;
  bandwidth_gb?: number;
  essential_sms_total?: number;
  essential_sms_monthly?: number;
  activity_retention_days?: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
}

export interface BillingTerm {
  id: string;
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
}

export interface PlanPrice {
  planId: string;
  billingTermId: string;
  price: string;
}
