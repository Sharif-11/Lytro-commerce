import { z } from 'zod';
import { MONEY_AMOUNT_MAX, OPERATOR_REASON_MAX_LENGTH } from '../../common/limits';
import { textField } from '../../common/text';

// POST /operator/tenants/:id/balance-adjust: an operator's manual correction (BAL-17). Signed amount; a reason
// is required so an empty one is rejected before it ever reaches the service. Bounded to what `numeric(12,2)`
// can actually hold -- past that it's a raw Postgres overflow, not a clean validation error.
export const adjustBalanceSchema = z.object({
  amount: z.coerce
    .number()
    .refine((value) => value !== 0, 'Enter a non-zero amount.')
    .refine((value) => Math.abs(value) <= MONEY_AMOUNT_MAX, 'Enter a smaller amount.'),
  reason: textField(OPERATOR_REASON_MAX_LENGTH),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
