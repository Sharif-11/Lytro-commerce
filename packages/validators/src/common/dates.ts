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
