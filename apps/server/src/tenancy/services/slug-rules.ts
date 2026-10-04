import { isValidSlug } from './host';

// AUTH-11: the address is at most 30 characters, leaving room for a numeric suffix such as "-12".
export const MAX_SLUG_LENGTH = 30;
const SUFFIX_LIMIT = 99;

/**
 * Pre-fills the address field from the shop name: keeps the Latin letters and digits, turns every other
 * run of characters into one hyphen, and lowercases. Accents are folded (Côte becomes cote).
 * Returns null when the name has no Latin letter, so the owner must type an address instead.
 */
export function suggestBase(shopName: string): string | null {
  const folded = shopName.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!/[a-z]/.test(folded)) return null;

  const hyphenated = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const shortened = truncateAtWord(hyphenated, MAX_SLUG_LENGTH);
  return isValidSlug(shortened) ? shortened : null;
}

/** Cuts at a hyphen where possible, so no word is split in half. */
function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const boundary = cut.lastIndexOf('-');
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
}

/** Removes a trailing "-<number>" so re-suggesting an address does not stack suffixes. */
export function stripNumericSuffix(address: string): string {
  const stripped = address.replace(/-\d+$/, '');
  return isValidSlug(stripped) ? stripped : address;
}

/** The candidates after the base itself: base-2, base-3, … up to the limit. The suffix never pushes the address past 30. */
export function suffixCandidates(base: string): string[] {
  const candidates: string[] = [];
  for (let n = 2; n <= SUFFIX_LIMIT + 1; n += 1) {
    const suffix = `-${String(n)}`;
    const head = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '');
    candidates.push(`${head}${suffix}`);
  }
  return candidates;
}
