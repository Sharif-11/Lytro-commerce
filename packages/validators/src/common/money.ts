import { z } from 'zod';
import { FieldProblemCode } from '../validation/field-problem';

// A non-negative taka amount with at most two decimal places -- shared by every rate field that takes a
// plain number rather than a pre-formatted string (RAT-02/08's platform rates, RAT-14's per-tenant one).
export const nonNegativeMoneyField = z.coerce
  .number()
  .nonnegative('Cannot be negative.')
  .refine((value) => Math.round(value * 100) === value * 100, {
    message: 'Use at most two decimals.',
    params: { problem: FieldProblemCode.TooManyDecimals },
  });
