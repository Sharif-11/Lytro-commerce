import { z } from 'zod';
import { planLimitsSchema } from '../../db/plans/plan-limits';

// POST /operator/tenants/:id/limit-overrides (PLN-11): one override per (tenant, limit key); a required reason.
// limitKey is restricted to an actual key of PlanLimits, so an override can never target a limit that doesn't
// exist (one definition of "what a limit is," shared with the plan schema itself).
const limitKeys = Object.keys(planLimitsSchema.shape) as [string, ...string[]];

export const setPlanLimitOverrideSchema = z.object({
  limitKey: z.enum(limitKeys),
  value: z.union([z.number().int().nonnegative(), z.boolean()]),
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type SetPlanLimitOverrideInput = z.infer<typeof setPlanLimitOverrideSchema>;
