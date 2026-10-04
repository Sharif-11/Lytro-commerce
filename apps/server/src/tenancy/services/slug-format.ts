import { Injectable } from '@nestjs/common';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@lytronix/validators';

// AUTH-11: the address format comes from @lytronix/validators. Suggestions and suffixes follow the same format.
const SUFFIX_LIMIT = 99;

@Injectable()
export class SlugFormat {
  isValid(candidate: string): boolean {
    return SLUG_PATTERN.test(candidate);
  }

  /**
   * Pre-fills the address field from the shop name: keeps the Latin letters and digits, turns every other run of
   * characters into one hyphen, and lowercases. Accents are folded (Côte becomes cote). Returns null when the name
   * has no Latin letter, so the owner must type an address instead.
   */
  suggestBase(shopName: string): string | null {
    const folded = shopName.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!/[a-z]/.test(folded)) return null;

    const hyphenated = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const shortened = this.truncateAtWord(hyphenated, SLUG_MAX_LENGTH);
    return this.isValid(shortened) ? shortened : null;
  }

  /** Removes a trailing "-<number>" so re-suggesting an address does not stack suffixes. */
  stripNumericSuffix(address: string): string {
    const stripped = address.replace(/-\d+$/, '');
    return this.isValid(stripped) ? stripped : address;
  }

  /** The candidates after the base itself: base-2, base-3, up to the limit. The suffix never pushes past 30. */
  suffixCandidates(base: string): string[] {
    const candidates: string[] = [];
    for (let n = 2; n <= SUFFIX_LIMIT + 1; n += 1) {
      const suffix = `-${String(n)}`;
      const head = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '');
      candidates.push(`${head}${suffix}`);
    }
    return candidates;
  }

  /** Cuts at a hyphen where possible, so no word is split in half. */
  private truncateAtWord(value: string, max: number): string {
    if (value.length <= max) return value;
    const cut = value.slice(0, max);
    const boundary = cut.lastIndexOf('-');
    return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
  }
}
