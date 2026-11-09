import type {
  FraudOrderFacts,
  NewFraudCheck,
  OwnOrderCounts,
  SelectFraudCheck,
  SelectFraudCheckSkip,
  SelectFraudRule,
  Transaction,
} from '@lytronix/db';
import type { FraudSkipReason } from '@lytronix/validators';

/** FRD-01 to FRD-05 (Phase 7 Slice 7.5): a shop's fraud checks, its own orders with a phone, and its automatic rule. */
export interface FraudCheckStore {
  /** One of the shop's transactions. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** LIF-19: the day-60 deletion's fraud step: the checks and the rule. */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
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
  /** FRD-05 (Slice 7.7): why a new order's automatic check didn't run. */
  recordSkip(
    tx: Transaction,
    skip: {
      tenantId: string;
      orderId: string;
      reason: FraudSkipReason;
      minAmount: string | null;
      messageKey: string | null;
    },
  ): Promise<void>;
  orderCheck(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<{
    order: FraudOrderFacts | null;
    check: SelectFraudCheck | null;
    skip: SelectFraudCheckSkip | null;
  }>;
}
