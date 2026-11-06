import { z } from 'zod';
import { FieldProblemCode } from '../validation/field-problem';

// A non-negative taka amount with at most two decimal places -- shared by every rate field that takes a
// plain number rather than a pre-formatted string (RAT-02/08's platform rates, RAT-14's per-tenant one).
export const nonNegativeMoneyField = z.coerce
  .number()
  .nonnegative('Cannot be negative.')
  // Within float error of whole paisa: 1.1 * 100 is 110.00000000000001 in a double, and 1.1 TK is two decimals.
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Use at most two decimals.',
    params: { problem: FieldProblemCode.TooManyDecimals },
  });

/**
 * SMS-10 (Slice 7.2): a taka amount as a message writes it, grouped the Bangladeshi way and without empty paisa:
 * 1250.00 is 1,250 and 125000.50 is 1,25,000.50.
 */
export function takaFigure(value: string): string {
  const [whole = '0', paisa = ''] = value.trim().split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = whole.replace('-', '');
  const last = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last}` : last;
  return /^0*$/.test(paisa) ? `${sign}${grouped}` : `${sign}${grouped}.${paisa.padEnd(2, '0')}`;
}
