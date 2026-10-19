import { PRODUCT_SLUG_MAX_LENGTH } from '@lytronix/validators';

// Leaves room for a "-<n>" suffix inside the slug's maximum length.
const BASE_MAX_LENGTH = PRODUCT_SLUG_MAX_LENGTH - 8;

/**
 * PRD-02: a link slug from a name. Lower case; letters (Bangla included, with its vowel signs) and digits kept;
 * every run of anything else becomes one hyphen; joiners that only shape Bangla letters are dropped. A name with
 * no letters or digits at all takes the fallback.
 */
export function slugOf(name: string, fallback: string): string {
  const slug = name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .slice(0, BASE_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

/** PRD-02: the base itself when free, else the first of base-2, base-3, ... that nothing holds. */
export function nextFreeSlug(base: string, taken: readonly string[]): string {
  const held = new Set(taken);
  if (!held.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${String(suffix)}`;
    if (!held.has(candidate)) return candidate;
  }
}
