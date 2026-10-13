import type { BalanceRow, Transaction } from '@lytronix/db';
import type { PlanLimits } from '@lytronix/validators';

// Shop rows and the Trial plan, written inside the caller's transaction. Implemented in database/adapters.
export interface TenantStore {
  /** Opens a transaction for a caller that doesn't have one yet. control.tenants has no RLS, so no tenant
   * context to set -- this is a plain transaction, unlike balance's tenant-scoped `run`. */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null>;
  insertTenant(
    tx: Transaction,
    values: {
      ownerIdentityId: string;
      subscriberId: string;
      shopName: string;
      slug: string;
      planId: string;
      planSnapshot: PlanLimits;
      periodStart: Date;
      periodEnd: Date;
    },
  ): Promise<string>;
  /** Locks the tenant's balance row for the rest of the transaction (BAL-11). Null if the tenant does not exist. */
  lockBalanceForUpdate(tx: Transaction, tenantId: string): Promise<BalanceRow | null>;
  /** BAL-07/08/09: freezes or unfreezes the balance without touching its amount. */
  setBalanceFrozen(tx: Transaction, tenantId: string, frozen: boolean): Promise<void>;
  /** PLN-17: activates a not-for-sale plan assignment with a normal snapshot. */
  applyPlanAssignment(
    tx: Transaction,
    tenantId: string,
    values: { planId: string; planSnapshot: PlanLimits; periodStart: Date; periodEnd: Date | null },
  ): Promise<void>;
  /** Writes the new balance, and optionally the frozen flag and/or the cached last-activity timestamp (D2-11). */
  applyBalanceChange(
    tx: Transaction,
    tenantId: string,
    amount: string,
    options?: { frozen?: boolean; touchActivityAt?: Date },
  ): Promise<void>;
}
