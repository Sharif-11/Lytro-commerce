import { z } from 'zod';
import { RECORD_KEY_MAX_LENGTH } from '../../common/limits';
import { planLimitsSchema } from '../../db/plans/plan-limits';

const featuresField = z.record(z.string().max(RECORD_KEY_MAX_LENGTH), z.boolean());

// POST /operator/plans (PLN-01, PLN-03): prices are set separately (control.plan_prices, one call per term).
export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  rank: z.number().int(),
  forSale: z.boolean().default(true),
  limits: planLimitsSchema,
  features: featuresField.default({}),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

// PATCH /operator/plans/:id: every field optional, partial update. PLN-02's versioning happens in the service,
// not here.
export const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  rank: z.number().int().optional(),
  forSale: z.boolean().optional(),
  limits: planLimitsSchema.optional(),
  features: featuresField.optional(),
});
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// PUT /operator/plans/:id/suggested (PLN-21): marks or unmarks the plan the pricing page highlights. Its own route, not
// a PATCH field: the mark is not a plan term, so it never makes a new version.
export const setPlanSuggestedSchema = z.object({
  suggested: z.boolean(),
});
export type SetPlanSuggestedInput = z.infer<typeof setPlanSuggestedSchema>;
