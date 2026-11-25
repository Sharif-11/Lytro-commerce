import { z } from 'zod';
import { nonNegativeMoneyField } from '../../common/money';
import { FieldProblemCode } from '../../validation/field-problem';

/**
 * PYG-26 (PAYG-FAIR-USE-PLAN PF-14, PF-36, PFQ-10): the most a pay-as-you-go shop's own website may be charged for API
 * requests in a cycle, set by the seller: ৳0 to ৳5,000, where ৳0 stops at the free allowance. ৳200 unless set.
 */
export const PAYG_API_CAP_MAX = 5000;
export const PAYG_API_CAP_DEFAULT = '200.00';
/** PF-14: requests are charged in whole blocks of this many. */
export const PAYG_API_BLOCK = 1000;
/** PF-36: the seller is warned once the cycle's charge reaches this share of the cap. */
export const PAYG_API_CAP_WARN_PERCENT = 80;

export const apiCapInputSchema = z
  .object({
    cap: nonNegativeMoneyField.refine((value) => value <= PAYG_API_CAP_MAX, {
      message: `At most ${String(PAYG_API_CAP_MAX)}.`,
      params: { problem: FieldProblemCode.TooLarge, max: PAYG_API_CAP_MAX },
    }),
  })
  .strict();
export type ApiCapInput = z.infer<typeof apiCapInputSchema>;

const MASK = '•';

/**
 * PYG-22 (PF-21): a locked order's phone, its first three and last three digits: `017•••••842`, one run like every phone
 * shown (phoneShown; the owner, 2026-11-25). A number written with the country code reads as the local one.
 */
export function maskedPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('880') ? `0${digits.slice(3)}` : digits;
  if (local.length < 6) return MASK.repeat(local.length);
  return `${local.slice(0, 3)}${MASK.repeat(local.length - 6)}${local.slice(-3)}`;
}

/** PYG-22 (PF-21, PFQ-6): a locked order's name, its first letter only: `স•••`. */
export function maskedName(name: string | null): string | null {
  if (name === null) return null;
  const first = Array.from(name.trim())[0];
  return first === undefined ? null : `${first}${MASK.repeat(3)}`;
}
