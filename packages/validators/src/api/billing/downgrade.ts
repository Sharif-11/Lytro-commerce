import { z } from 'zod';

// POST /billing/downgrade/preview and /billing/downgrade/schedule (DWN-01/03): the lower-ranked plan to move
// to -- no billing term at all, a downgrade schedules a plan, not a priced purchase (the term is chosen
// later, the normal way, at whatever renewal happens after the switch).
export const targetDowngradePlanSchema = z.object({
  planId: z.string().uuid(),
});
export type TargetDowngradePlanInput = z.infer<typeof targetDowngradePlanSchema>;
