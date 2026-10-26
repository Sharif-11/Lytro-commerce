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
  listForSale(tx: Transaction): Promise<PlanRecord[]>;
  listAll(tx: Transaction): Promise<PlanRecord[]>;
  /** PYG-01: the seeded plan a pay-as-you-go shop is on, never for sale; null before the seed. */
  findPayAsYouGo(tx: Transaction): Promise<PlanRecord | null>;
  update(tx: Transaction, id: string, edit: PlanEditValues): Promise<PlanRecord | null>;
  isReferenced(tx: Transaction, id: string): Promise<boolean>;
  delete(tx: Transaction, id: string): Promise<void>;
  listVersions(tx: Transaction, planId: string): Promise<PlanVersionRecord[]>;
}
