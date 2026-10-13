import { z } from 'zod';
import { planLimitsSchema } from '../../db/plans/plan-limits';

// POST /operator/plans (PLN-01, PLN-03): prices are set separately (control.plan_prices, one call per term).
export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  rank: z.number().int(),
  forSale: z.boolean().default(true),
  limits: planLimitsSchema,
  features: z.record(z.boolean()).default({}),
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
  features: z.record(z.boolean()).optional(),
});
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
