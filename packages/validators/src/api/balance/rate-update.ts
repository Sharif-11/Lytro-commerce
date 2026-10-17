import { z } from 'zod';
import { nonNegativeMoneyField } from '../../common/money';

// PATCH /operator/rates/:key (RAT-02, RAT-08): non-negative, two decimals, immediate effect.
export const updateRateSchema = z.object({
  value: nonNegativeMoneyField,
  // RAT-09: set once the operator publishes the prefilled notice for this change, if they do.
  noticeId: z.string().uuid().optional(),
});
export type UpdateRateInput = z.infer<typeof updateRateSchema>;
