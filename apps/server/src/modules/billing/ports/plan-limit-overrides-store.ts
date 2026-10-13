import type { Transaction } from '@lytronix/db';
import type { PlanLimitOverrideRecord } from '../types/plan-assignment';

/** control.plan_limit_overrides (PLN-11). */
export interface PlanLimitOverridesStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  set(
    tx: Transaction,
    values: { tenantId: string; limitKey: string; value: unknown; reason: string; setBy: string },
  ): Promise<PlanLimitOverrideRecord>;
  listForTenant(tx: Transaction, tenantId: string): Promise<PlanLimitOverrideRecord[]>;
  remove(tx: Transaction, tenantId: string, limitKey: string): Promise<void>;
}
