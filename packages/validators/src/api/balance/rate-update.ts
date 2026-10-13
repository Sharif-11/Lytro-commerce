import { z } from 'zod';

// PATCH /operator/rates/:key (RAT-02, RAT-08): non-negative, two decimals, immediate effect.
export const updateRateSchema = z.object({
  value: z.coerce
    .number()
    .nonnegative('A rate cannot be negative.')
    .refine((value) => Math.round(value * 100) === value * 100, 'Use at most two decimals.'),
  // RAT-09: set once the operator publishes the prefilled notice for this change, if they do.
  noticeId: z.string().uuid().optional(),
});
export type UpdateRateInput = z.infer<typeof updateRateSchema>;
