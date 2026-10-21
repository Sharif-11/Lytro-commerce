import type { Transaction } from '@lytronix/db';
import type { PlanLimits, TenantState } from '@lytronix/validators';

/** What a shop's warnings need to know about it: what its cycles count from, and its own limits (PLN-11). */
export interface WarnedShop {
  state: TenantState;
  periodStart: Date | null;
  createdAt: Date;
  limits: PlanLimits | null;
}

/** control.usage_warnings (LIM-01): the highest share of each limit a shop was warned of, per cycle. */
export interface UsageWarningStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  findShop(tenantId: string): Promise<WarnedShop | null>;
  warned(tx: Transaction, tenantId: string, metric: string, cycleStart: Date): Promise<number>;
  setWarned(
    tx: Transaction,
    tenantId: string,
    metric: string,
    cycleStart: Date,
    percent: number,
  ): Promise<void>;
  deleteForTenant(tenantId: string): Promise<void>;
}
