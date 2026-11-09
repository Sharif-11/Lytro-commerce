import { z } from 'zod';
import { bdMobileNumber } from '../../common/phone';
import { TenantState } from '../../db/enums';

/** ADM-02, D8-7: the shop list's orders. Each pages on its own keyset (never OFFSET). */
export enum TenantSort {
  Newest = 'newest',
  Name = 'name',
  // Soonest first; a shop with no period end (a trial or pay-as-you-go one) comes last.
  PeriodEnd = 'period_end',
}

/** D8-24: the fewest digits an owner's-phone search matches as the number's ending. */
export const PHONE_SEARCH_MIN_DIGITS = 6;

/** D8-24: how a search reads as the owner's phone: the whole number, or its last digits. */
export type PhoneSearch = { exact: string } | { ending: string };

/**
 * D8-24: a search typed as a Bangladeshi mobile number in any written form matches that number exactly; 6 to 10 digits
 * match the end of one. Anything else isn't a phone search, though it still matches a shop's name or address.
 */
export function phoneSearchOf(query: string): PhoneSearch | null {
  const exact = bdMobileNumber(query);
  if (exact) return { exact };
  const digits = query.replace(/[\s-]/g, '');
  return /^\d+$/.test(digits) && digits.length >= PHONE_SEARCH_MIN_DIGITS && digits.length <= 10
    ? { ending: digits }
    : null;
}

// GET /operator/tenants (ADM-02, D8-7): the operator's shop list, searched by shop name, address or the owner's phone,
// filtered by state and plan, sorted, in keyset pages (the same discipline listActivitySchema already follows).
export const searchTenantsSchema = z.object({
  query: z.string().trim().min(1).optional(),
  // Pay-as-you-go is a state, so this filter also finds those shops apart (PYG-13).
  state: z.nativeEnum(TenantState).optional(),
  planId: z.string().uuid().optional(),
  sort: z.nativeEnum(TenantSort).default(TenantSort.Newest),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SearchTenantsQuery = z.infer<typeof searchTenantsSchema>;
