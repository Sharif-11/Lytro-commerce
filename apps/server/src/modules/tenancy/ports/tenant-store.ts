import type {
  BalanceRow,
  BillingInfoRow,
  ContactDetailsRow,
  LapsingCandidateRow,
  PaygCandidateRow,
  Transaction,
} from '@lytronix/db';
import type { PlanLimits, TenantState } from '@lytronix/validators';

// Shop rows and the Trial/Pay-as-you-go plans, written inside the caller's transaction. Implemented in
// database/adapters.
export interface TenantStore {
  /** Opens a transaction for a caller that doesn't have one yet. control.tenants has no RLS, so no tenant
   * context to set -- this is a plain transaction, unlike balance's tenant-scoped `run`. */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null>;
  /** TRL-07: the plan a trial converts to at day 30 with no purchase. */
  findPayAsYouGoPlan(tx: Transaction): Promise<{ id: string; limits: PlanLimits } | null>;
  /** TRL-07: trials whose period has ended with no purchase. */
  findExpiredTrialIds(tx: Transaction, now: Date): Promise<string[]>;
  /** BIL-10/11: a transaction-scoped read for a purchase/renewal confirmation's extend-vs-restart decision. */
  findBillingInfo(tx: Transaction, tenantId: string): Promise<BillingInfoRow | null>;
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
  /** PLN-17/TRL-07: activates a plan assignment with a normal snapshot; `state` is the caller's to decide. */
  applyPlanAssignment(
    tx: Transaction,
    tenantId: string,
    values: {
      planId: string;
      planSnapshot: PlanLimits;
      periodStart: Date;
      periodEnd: Date | null;
      state: TenantState;
      billingTermId?: string | null;
    },
  ): Promise<void>;
  /** BIL-17: toggles the owner's own "renew automatically from balance" setting. */
  setAutoRenew(tx: Transaction, tenantId: string, enabled: boolean): Promise<void>;
  /** Writes the new balance, and optionally the frozen flag and/or the cached last-activity timestamp (D2-11). */
  applyBalanceChange(
    tx: Transaction,
    tenantId: string,
    amount: string,
    options?: { frozen?: boolean; touchActivityAt?: Date },
  ): Promise<void>;
  /** LIF-03/04/23: the lifecycle job's own state write -- plan, period and balance are untouched. */
  setLifecycleState(tx: Transaction, tenantId: string, state: TenantState): Promise<void>;
  /** LIF-24: an operator closing the public/dashboard side for cause, independent of `state` (checked directly). */
  setSuspension(tx: Transaction, tenantId: string, reason: string, at: Date): Promise<void>;
  /** LIF-15/24: lifts a suspension -- restore (any plan activation) and operator restore both call this. */
  clearSuspension(tx: Transaction, tenantId: string): Promise<void>;
  /** LIF-01: sets or clears the owner's own non-renewal intent; the state machine never reads this. */
  setCancellation(tx: Transaction, tenantId: string, cancelledAt: Date | null): Promise<void>;
  /** LIF-19: the day-60 deletion job's own state/marker write, after the business-data deletion step. */
  markDeleted(tx: Transaction, tenantId: string, at: Date): Promise<void>;
  /** LIF-03/04: every tenant whose lifecycle state is derived from a running period, not yet deleted. */
  findLapsingCandidates(tx: Transaction, now: Date): Promise<LapsingCandidateRow[]>;
  /** PYG-21: every pay-as-you-go tenant, not yet deleted -- the 23/30-day thresholds are the service's job. */
  findPaygInactiveCandidates(tx: Transaction): Promise<PaygCandidateRow[]>;
  /** PYG-21/LIF-19: tenants already archived by the inactivity pass, awaiting their own day-60 deletion. */
  findPaygArchivedCandidates(tx: Transaction): Promise<PaygCandidateRow[]>;
  /** TEN-30: the owner's own contact phone/email/business address. */
  findContactDetails(tx: Transaction, tenantId: string): Promise<ContactDetailsRow | null>;
  /** TEN-30: updates whichever fields the caller sent; an omitted key leaves its current value untouched. */
  updateContactDetails(
    tx: Transaction,
    tenantId: string,
    values: Partial<ContactDetailsRow>,
  ): Promise<void>;
}
