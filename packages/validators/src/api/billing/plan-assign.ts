import { z } from 'zod';

// POST /operator/plans/:id/assign (PLN-17/18): no payment step; a reason is required.
export const assignPlanSchema = z.object({
  tenantId: z.string().uuid(),
  expiry: z.coerce.date().optional(), // omitted = no expiry (PLN-18)
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type AssignPlanInput = z.infer<typeof assignPlanSchema>;
