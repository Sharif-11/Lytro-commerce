import { z } from 'zod';

// POST /operator/tenants/:id/balance-adjust: an operator's manual correction (BAL-17). Signed amount; a reason
// is required so an empty one is rejected before it ever reaches the service.
export const adjustBalanceSchema = z.object({
  amount: z.coerce.number().refine((value) => value !== 0, 'Enter a non-zero amount.'),
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
