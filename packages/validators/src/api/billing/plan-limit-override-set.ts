import { z } from 'zod';
import { OPERATOR_REASON_MAX_LENGTH } from '../../common/limits';
import { textField } from '../../common/text';
import { planLimitsSchema } from '../../db/plans/plan-limits';

// POST /operator/tenants/:id/limit-overrides (PLN-11): one override per (tenant, limit key); a required reason.
// limitKey is restricted to an actual key of PlanLimits, so an override can never target a limit that doesn't
// exist (one definition of "what a limit is," shared with the plan schema itself).
const limitKeys = Object.keys(planLimitsSchema.shape) as [string, ...string[]];

export const setPlanLimitOverrideSchema = z.object({
  limitKey: z.enum(limitKeys),
  // PLN-19: null overrides a limit to unlimited, exactly like a numeric override caps it.
  value: z.union([z.number().int().nonnegative(), z.boolean(), z.null()]),
  reason: textField(OPERATOR_REASON_MAX_LENGTH),
});
export type SetPlanLimitOverrideInput = z.infer<typeof setPlanLimitOverrideSchema>;
