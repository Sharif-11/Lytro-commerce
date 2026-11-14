import { z } from 'zod';
import { FieldProblemCode } from '../validation/field-problem';

// A calendar day in Asia/Dhaka, written YYYY-MM-DD: a period's ends (INV-18), a batch's expiry date (INV-12).
export const calendarDayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use YYYY-MM-DD.' })
  .max(10)
  .refine(
    (value) => {
      // A month or day past any calendar's (2031-13-01) parses to nothing, and toISOString would throw on it.
      const at = Date.parse(`${value}T00:00:00Z`);
      return !Number.isNaN(at) && new Date(at).toISOString().startsWith(value);
    },
    {
      message: 'Not a real date.',
      params: { problem: FieldProblemCode.InvalidDate },
    },
  );

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

/**
 * The part of the day a Bangla time names, by the hour of a 24-hour clock (BRAND-IDENTITY §5), as the dashboard writes a
 * time (`সকাল 11:42`) and the dashboard and the website write the help line's hours (`সকাল 9টা থেকে রাত 10টা`).
 */
export function banglaPartOfDay(hour24: number): string {
  if (hour24 < 5) return 'রাত';
  if (hour24 < 12) return 'সকাল';
  if (hour24 < 16) return 'দুপুর';
  if (hour24 < 19) return 'বিকাল';
  return 'রাত';
}
