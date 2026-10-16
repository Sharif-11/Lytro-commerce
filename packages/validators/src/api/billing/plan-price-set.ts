import { z } from 'zod';

// PUT /operator/plans/:id/prices/:billingTermId (TRM-03): the term's discount only pre-fills this on the
// editor's client side; the server always stores whatever price it's given, never recomputing one.
// PLN-03: a plan's price is positive whole taka -- `.int()` rejects 449.50, matching the limits' own
// `unlimitedInt()` (plan-limits.ts), which already requires `.int()` for the same reason.
export const setPlanPriceSchema = z.object({
  price: z.coerce.number().int().positive(),
});
export type SetPlanPriceInput = z.infer<typeof setPlanPriceSchema>;
