import { z } from 'zod';
import { OPERATOR_REASON_MAX_LENGTH } from '../../common/limits';
import { textField } from '../../common/text';

// POST /operator/plans/:id/assign (PLN-17/18): no payment step; a reason is required.
export const assignPlanSchema = z.object({
  tenantId: z.string().uuid(),
  expiry: z.coerce.date().optional(), // omitted = no expiry (PLN-18)
  reason: textField(OPERATOR_REASON_MAX_LENGTH),
});
export type AssignPlanInput = z.infer<typeof assignPlanSchema>;
