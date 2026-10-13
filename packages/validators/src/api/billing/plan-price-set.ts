import { z } from 'zod';

// PUT /operator/plans/:id/prices/:billingTermId (TRM-03): the term's discount only pre-fills this on the
// editor's client side; the server always stores whatever price it's given, never recomputing one.
export const setPlanPriceSchema = z.object({
  price: z.coerce.number().positive(),
});
export type SetPlanPriceInput = z.infer<typeof setPlanPriceSchema>;
