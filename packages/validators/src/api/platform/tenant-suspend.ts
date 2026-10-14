import { z } from 'zod';

// POST /operator/tenants/:id/suspend (LIF-24): an operator's cause, recorded with the suspension.
export const suspendTenantSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;
