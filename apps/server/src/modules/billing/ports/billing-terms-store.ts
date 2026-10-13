import type { Transaction } from '@lytronix/db';
import type { BillingTermRecord, PlanPriceRecord } from '../types/billing-term';

export interface NewBillingTermValues {
  labelBn: string;
  labelEn: string;
  months: number;
  visible: boolean;
  displayOrder: number;
  defaultDiscountPct: string | null;
  tenantId: string | null;
}

export interface BillingTermEditValues {
  labelBn?: string;
  labelEn?: string;
  months?: number;
  visible?: boolean;
  displayOrder?: number;
  defaultDiscountPct?: string | null;
}

/** control.billing_terms and control.plan_prices. */
export interface BillingTermsStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  create(tx: Transaction, values: NewBillingTermValues): Promise<BillingTermRecord>;
  findById(tx: Transaction, id: string): Promise<BillingTermRecord | null>;
  /** TRM-14: platform-wide terms plus, when given, the one tenant's own scoped terms. Visible only. */
  listVisibleFor(tx: Transaction, tenantId: string | null): Promise<BillingTermRecord[]>;
  listAll(tx: Transaction): Promise<BillingTermRecord[]>;
  update(
    tx: Transaction,
    id: string,
    edit: BillingTermEditValues,
  ): Promise<BillingTermRecord | null>;
  retire(tx: Transaction, id: string, at: Date): Promise<void>;
  isUsed(tx: Transaction, id: string): Promise<boolean>;
  delete(tx: Transaction, id: string): Promise<void>;
  setPrice(tx: Transaction, planId: string, billingTermId: string, price: string): Promise<void>;
  listPricesForPlan(tx: Transaction, planId: string): Promise<PlanPriceRecord[]>;
  removePrice(tx: Transaction, planId: string, billingTermId: string): Promise<void>;
}
