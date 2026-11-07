import type {
  NewFraudCheck,
  OwnOrderCounts,
  SelectFraudCheck,
  SelectFraudRule,
  Transaction,
} from '@lytronix/db';

/** FRD-01 to FRD-05 (Phase 7 Slice 7.5): a shop's fraud checks, its own orders with a phone, and its automatic rule. */
export interface FraudCheckStore {
  /** One of the shop's transactions. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** FRD-04: Steadfast's own answer for the phone given since `since`, to reuse. */
  steadfastAnswerSince(
    tx: Transaction,
    tenantId: string,
    phone: string,
    since: Date,
  ): Promise<SelectFraudCheck | null>;
  latest(tx: Transaction, tenantId: string, phone: string): Promise<SelectFraudCheck | null>;
  ownOrders(tx: Transaction, tenantId: string, phone: string): Promise<OwnOrderCounts>;
  insert(tx: Transaction, values: NewFraudCheck): Promise<SelectFraudCheck>;
  rule(tx: Transaction, tenantId: string): Promise<SelectFraudRule | null>;
  saveRule(
    tx: Transaction,
    tenantId: string,
    rule: { codOrders: boolean; minAmount: string | null },
  ): Promise<SelectFraudRule>;
}
