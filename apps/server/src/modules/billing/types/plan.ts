import type { PlanLimits } from '@lytronix/validators';

export interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  version: number;
  limits: PlanLimits;
  features: Record<string, boolean>;
  createdAt: Date;
}

export interface PlanVersionRecord {
  id: string;
  planId: string;
  version: number;
  name: string;
  description: string | null;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
  recordedAt: Date;
}
