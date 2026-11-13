import type { Transaction } from '@lytronix/db';
import type { PlanLimits } from '@lytronix/validators';
import type { PlanRecord, PlanVersionRecord } from '../types/plan';

export interface NewPlanValues {
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
}

export interface PlanEditValues {
  name?: string;
  description?: string | null;
  rank?: number;
  forSale?: boolean;
  limits?: PlanLimits;
  features?: Record<string, boolean>;
}

/** control.plans and control.plan_versions. Platform-wide (no tenant context), but edits need a real
 * transaction -- the version snapshot and the update must commit together (PLN-02). */
export interface PlansStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  create(tx: Transaction, values: NewPlanValues): Promise<PlanRecord>;
  findById(tx: Transaction, id: string): Promise<PlanRecord | null>;
  /** PLN-21: the plan, locked until the transaction ends. */
  findByIdForUpdate(tx: Transaction, id: string): Promise<PlanRecord | null>;
  listForSale(tx: Transaction): Promise<PlanRecord[]>;
  listAll(tx: Transaction): Promise<PlanRecord[]>;
  /** PYG-01: the seeded plan a pay-as-you-go shop is on, never for sale; null before the seed. */
  findPayAsYouGo(tx: Transaction): Promise<PlanRecord | null>;
  update(tx: Transaction, id: string, edit: PlanEditValues): Promise<PlanRecord | null>;
  isReferenced(tx: Transaction, id: string): Promise<boolean>;
  /**
   * Whether a plan is one of Lytro's own (Trial, Pay-as-you-go): given by Lytro itself and found by name, so never for
   * sale, renamed or deleted (found on staging 2026-11-12).
   */
  isPlatformPlan(name: string): boolean;
  /** PYG-01: whether a plan is the Pay-as-you-go plan, which the pricing page shows though it is never for sale. */
  isPayAsYouGo(name: string): boolean;
  /** PLN-21: serialises mark changes for the rest of the transaction. */
  lockSuggestion(tx: Transaction): Promise<void>;
  /** PLN-21: marks (clearing any other plan's mark) or unmarks a plan; never a new version. */
  setSuggested(tx: Transaction, id: string, suggested: boolean): Promise<PlanRecord | null>;
  shopsByVersion(tx: Transaction): Promise<{ planId: string; version: number; shops: number }[]>;
  delete(tx: Transaction, id: string): Promise<void>;
  listVersions(tx: Transaction, planId: string): Promise<PlanVersionRecord[]>;
}
