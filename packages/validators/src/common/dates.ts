import { z } from 'zod';
import { FieldProblemCode } from '../validation/field-problem';

// A calendar day in Asia/Dhaka, written YYYY-MM-DD: a period's ends (INV-18), a batch's expiry date (INV-12).
export const calendarDayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use YYYY-MM-DD.' })
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), {
    message: 'Not a real date.',
    params: { problem: FieldProblemCode.InvalidDate },
  });

/** INV-18, STA-01: a period's ends, the last on or after the first; either may be left out for its default. */
export function checkPeriod(
  value: { dateFrom?: string | undefined; dateTo?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    ctx.addIssue({
      code: 'custom',
      path: ['dateTo'],
      message: 'Choose a day on or after the start date.',
      params: { problem: FieldProblemCode.NotAllowed },
    });
  }
}
